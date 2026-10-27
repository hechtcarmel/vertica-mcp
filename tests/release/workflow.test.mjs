import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { URL } from "node:url";
import process from "node:process";

const workflow = readFileSync(
  new URL("../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const accepted =
  "821992b00c424afa8fe47254fc4d0364113b4c805ff2da50fb7599e0f5dfdbba";
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function job(name) {
  return workflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z_]+:\n/)[0];
}
const condition = job("build")
  .match(/ {4}if: >-\n((?: {6}.+\n)+)/)[1]
  .trim()
  .replace(/\s+/g, " ");
function allowed(ref, tag = "v2.0.0", publish = true, digest = accepted) {
  return runInNewContext(
    condition,
    {
      github: { ref },
      inputs: { tag, publish, validated_sha256: digest },
      format: (pattern, value) => pattern.replace("{0}", value),
    },
    { timeout: 100 },
  );
}
function permissions(block, indentation = 4) {
  const prefix = " ".repeat(indentation);
  const body = block.split(`${prefix}permissions:\n`)[1];
  if (!body) return {};
  const lines = body.split("\n");
  const entries = [];
  for (const line of lines) {
    const match = line.match(new RegExp(`^${prefix}  ([a-z-]+): ([a-z]+)$`));
    if (!match) break;
    entries.push([match[1], match[2]]);
  }
  return Object.fromEntries(entries);
}

describe("controlled release dispatch", () => {
  it.each([false, true])(
    "keeps the matching-tag release path for publish=%s",
    (publish) => {
      expect(allowed("refs/tags/v2.0.0", "v2.0.0", publish)).toBe(true);
      expect(allowed("refs/tags/v2.1.0", "v2.1.0", publish)).toBe(true);
    },
  );
  it("allows only the accepted v2.0.0 publication recovery from main", () => {
    expect(allowed("refs/heads/main")).toBe(true);
  });
  it.each([
    ["refs/heads/main", "v2.0.0", false, accepted],
    ["refs/heads/main", "v2.0.1", true, accepted],
    ["refs/heads/main", "v2.0.0", true, "0".repeat(64)],
    ["refs/heads/main", "v2.0.0", true, ""],
    ["refs/heads/feature", "v2.0.0", true, accepted],
    ["refs/heads/v2.0.0", "v2.0.0", true, accepted],
    ["refs/pull/7/merge", "v2.0.0", true, accepted],
    ["refs/tags/v2.0.1", "v2.0.0", true, accepted],
  ])("rejects unapproved recovery context %s %s %s", (...args) => {
    expect(allowed(...args)).toBe(false);
  });
  it("still checks out the existing input tag, requires ancestry, and verifies accepted bytes", () => {
    const build = job("build");
    expect(build).toContain("ref: ${{ inputs.tag }}");
    expect(build).toContain(
      'git merge-base --is-ancestor HEAD "origin/$DEFAULT_BRANCH"',
    );
    expect(build).toContain(
      'node scripts/prepare-artifact.mjs --release-tag "$RELEASE_TAG"',
    );
    expect(build).toContain(
      'node scripts/verify-artifact.mjs --sha256 "$VALIDATED_SHA256"',
    );
    expect(workflow).not.toMatch(/^ {2}(?:push|release):/m);
    expect(workflow).toContain("        default: false");
    expect(job("publish")).toContain("needs: [build, verify_draft]");
    expect(job("finalize")).toContain("needs: publish");
  });
  it("keeps OIDC limited to publishing and scopes the approved Contents write to draft verification", () => {
    expect(permissions(workflow, 0)).toEqual({ contents: "read" });
    expect(permissions(job("build"))).toEqual({});
    expect(permissions(job("draft"))).toEqual({ contents: "write" });
    expect(permissions(job("verify_draft"))).toEqual({ contents: "write" });
    expect(permissions(job("publish"))).toEqual({
      contents: "read",
      "id-token": "write",
    });
    expect(permissions(job("finalize"))).toEqual({ contents: "write" });
  });
});

// Isolated cloud/CI tests only. Never run this suite in real Mac validation.
const guard = job("verify_draft")
  .split("        run: |\n")[1]
  .split("\n")
  .map((line) => line.slice(10))
  .join("\n");
const fakeGh = `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'release' && args[1] === 'view') {
  if (process.env.FIXTURE_STATUS === 'not_visible') {
    process.stderr.write('release not found\\n');
    process.exit(1);
  }
  process.stdout.write(process.env.FIXTURE_STATUS === 'draft' ? 'true\\n' : 'false\\n');
} else if (args[0] === 'release' && args[1] === 'download') {
  fs.copyFileSync(process.env.FIXTURE_BYTES, args[args.indexOf('--dir') + 1] + '/candidate.tgz');
} else {
  process.exit(99);
}
`;
function verifyDraft(status, correctDigest = true) {
  const directory = mkdtempSync(join(tmpdir(), "vertica-release-guard-"));
  directories.push(directory);
  // gh is deliberately a local stub; real credentials and other env are not inherited.
  writeFileSync(join(directory, "package.json"), '{"type":"module"}');
  const executable = join(directory, "gh");
  writeFileSync(executable, fakeGh);
  chmodSync(executable, 0o700);
  const bytes = join(directory, "fixture.tgz");
  writeFileSync(bytes, "accepted-package-fixture");
  const digest = createHash("sha256").update(readFileSync(bytes)).digest("hex");
  const calls = join(directory, "calls.jsonl");
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", guard], {
    cwd: directory,
    env: {
      PATH: `${directory}:${process.env.PATH}`,
      GH_REPO: "unit-fixture/unit-fixture",
      RELEASE_TAG: "v2.0.0",
      VALIDATED_SHA256: correctDigest ? digest : "0".repeat(64),
      FIXTURE_STATUS: status,
      FIXTURE_BYTES: bytes,
      FIXTURE_CALLS: calls,
    },
    encoding: "utf8",
    timeout: 5000,
  });
  expect(result.error).toBeUndefined();
  const invoked = readFileSync(calls, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(
    invoked.every(
      (args) => args[0] === "release" && ["view", "download"].includes(args[1]),
    ),
  ).toBe(true);
  return { status: result.status, calls: invoked };
}
describe("existing draft integrity guard", () => {
  it("accepts only an existing draft with the accepted package bytes", () => {
    const result = verifyDraft("draft");
    expect(result.status).toBe(0);
    expect(result.calls).toHaveLength(2);
  });
  it.each(["not_visible", "published"])(
    "rejects %s before any download",
    (status) => {
      const result = verifyDraft(status);
      expect(result.status).not.toBe(0);
      expect(result.calls).toHaveLength(1);
    },
  );
  it("rejects a draft asset with the wrong digest", () => {
    const result = verifyDraft("draft", false);
    expect(result.status).not.toBe(0);
    expect(result.calls).toHaveLength(2);
  });
});

const publishScript = job("publish")
  .split("        run: |\n")[1]
  .split("\n")
  .map((line) => line.slice(10))
  .join("\n");
const npmCli = process.env.npm_execpath?.endsWith("npm-cli.js")
  ? process.env.npm_execpath
  : join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
function isolatedNpmEnv(directory) {
  const userConfig = join(directory, "user.npmrc");
  const globalConfig = join(directory, "global.npmrc");
  writeFileSync(userConfig, "");
  writeFileSync(globalConfig, "");
  return {
    PATH: `${directory}:${process.env.PATH}`,
    npm_config_userconfig: userConfig,
    npm_config_globalconfig: globalConfig,
    npm_config_cache: join(directory, "npm-cache"),
    npm_config_offline: "true",
    npm_config_ignore_scripts: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    npm_config_loglevel: "error",
  };
}
let packedFixture;
beforeAll(() => {
  const directory = mkdtempSync(join(tmpdir(), "vertica-local-package-"));
  try {
    const source = join(directory, "source");
    mkdirSync(source);
    writeFileSync(
      join(source, "package.json"),
      JSON.stringify({
        name: "@vertica-mcp-release-tests/local-package",
        version: "2.0.0",
        files: ["index.js"],
      }),
    );
    writeFileSync(join(source, "index.js"), "export const fixture = true;\n");
    const result = spawnSync(
      process.execPath,
      [
        npmCli,
        "pack",
        source,
        "--pack-destination",
        directory,
        "--ignore-scripts",
        "--json",
      ],
      {
        cwd: directory,
        env: isolatedNpmEnv(directory),
        encoding: "utf8",
        timeout: 10000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const [packed] = JSON.parse(result.stdout);
    packedFixture = readFileSync(join(directory, packed.filename));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
const dryRunNpm = `#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + '\\n');
if (args[0] !== 'publish') process.exit(99);
// Dry-run is mandatory in this cloud test wrapper; no registry credentials exist.
const result = spawnSync(process.execPath, [process.env.FIXTURE_NPM_CLI, ...args, '--dry-run', '--json'], {
  env: process.env, encoding: 'utf8', timeout: 10000,
});
fs.writeFileSync(process.env.FIXTURE_NPM_REPORT, result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 99);
`;
function publishFixture(names, validDigest = true, directoryInstead = false) {
  const directory = mkdtempSync(join(tmpdir(), "vertica-local-publish-"));
  directories.push(directory);
  mkdirSync(join(directory, "artifacts"));
  writeFileSync(join(directory, "package.json"), '{"type":"module"}');
  for (const name of names) {
    const path = join(directory, "artifacts", name);
    if (directoryInstead) mkdirSync(path);
    else writeFileSync(path, packedFixture);
  }
  const npm = join(directory, "npm");
  writeFileSync(npm, dryRunNpm);
  chmodSync(npm, 0o700);
  // Catch any regression to GitHub shorthand locally before Git/SSH can run.
  const gitCalls = join(directory, "git-calls");
  const git = join(directory, "git");
  writeFileSync(
    git,
    `#!/usr/bin/env node\nimport fs from 'node:fs'; fs.writeFileSync(process.env.FIXTURE_GIT_CALLS, 'unexpected git invocation'); process.exit(98);\n`,
  );
  chmodSync(git, 0o700);
  const calls = join(directory, "npm-calls.jsonl");
  const report = join(directory, "npm-report.json");
  const result = spawnSync(
    "bash",
    ["-e", "-o", "pipefail", "-c", publishScript],
    {
      cwd: directory,
      env: {
        ...isolatedNpmEnv(directory),
        DIST_TAG: "latest",
        VALIDATED_SHA256: validDigest
          ? createHash("sha256").update(packedFixture).digest("hex")
          : "0".repeat(64),
        FIXTURE_CALLS: calls,
        FIXTURE_NPM_CLI: npmCli,
        FIXTURE_NPM_REPORT: report,
        FIXTURE_GIT_CALLS: gitCalls,
      },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(existsSync(gitCalls)).toBe(false);
  return {
    ...result,
    calls: existsSync(calls)
      ? readFileSync(calls, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [],
    report: existsSync(report)
      ? JSON.parse(readFileSync(report, "utf8"))
      : null,
  };
}
describe("verified local npm tarball publication", () => {
  it.each(["candidate.tgz", "candidate with spaces.tgz"])(
    "treats %s as a local tarball in a real offline npm publish dry-run",
    (name) => {
      const result = publishFixture([name]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.calls).toEqual([
        [
          "publish",
          `./artifacts/${name}`,
          "--ignore-scripts",
          "--access",
          "public",
          "--provenance",
          "--tag",
          "latest",
        ],
      ]);
      expect(
        result.report["@vertica-mcp-release-tests/local-package"],
      ).toMatchObject({
        id: "@vertica-mcp-release-tests/local-package@2.0.0",
      });
    },
    15000,
  );
  it.each([
    [[], true, false],
    [["one.tgz", "two.tgz"], true, false],
    [["directory.tgz"], true, true],
    [["wrong-digest.tgz"], false, false],
  ])(
    "stops before npm for invalid artifacts %j",
    (names, validDigest, directoryInstead) => {
      const result = publishFixture(names, validDigest, directoryInstead);
      expect(result.status).not.toBe(0);
      expect(result.calls).toEqual([]);
    },
  );
});
