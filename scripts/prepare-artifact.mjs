import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import process from "node:process";
import console from "node:console";
import { releaseDetails, sha256 } from "./lib/release.mjs";

function command(commandName, args, capture = false) {
  const result = spawnSync(commandName, args, {
    encoding: "utf8",
    shell: false,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0)
    throw new Error(`Command failed: ${commandName}`);
  return result.stdout?.trim();
}

const { values } = parseArgs({
  options: {
    "release-tag": { type: "string" },
    "allow-dirty": { type: "boolean", default: false },
  },
});
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const metadata = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const dirty =
  command("git", ["status", "--porcelain", "--untracked-files=all"], true) !==
  "";
if (dirty && (!values["allow-dirty"] || values["release-tag"])) {
  throw new Error(
    "Commit the reviewed candidate before preparing a release artifact",
  );
}
const release = values["release-tag"]
  ? releaseDetails(values["release-tag"], metadata, changelog)
  : null;
const sourceCommit = command("git", ["rev-parse", "HEAD"], true);
if (
  release &&
  command(
    "git",
    ["rev-parse", `refs/tags/${values["release-tag"]}^{commit}`],
    true,
  ) !== sourceCommit
) {
  throw new Error("The release tag does not point to this checkout");
}
command(npm, ["run", "clean"]);
command(npm, ["run", "build"]);
const destination = resolve("artifacts");
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
const [packed] = JSON.parse(
  command(
    npm,
    ["pack", "--ignore-scripts", "--json", "--pack-destination", destination],
    true,
  ),
);
if (
  packed.files.some(
    ({ path }) =>
      path.startsWith("tests/") ||
      path.startsWith("src/") ||
      path.startsWith("node_modules/"),
  )
) {
  throw new Error("Unexpected source or test files in the package");
}
const digest = sha256(readFileSync(join(destination, packed.filename)));
const manifest = {
  schemaVersion: 1,
  name: metadata.name,
  version: metadata.version,
  sourceCommit,
  sourceTree: command("git", ["rev-parse", "HEAD^{tree}"], true),
  dirty,
  toolchain: {
    node: process.version,
    npm: command(npm, ["--version"], true),
    packageManager: metadata.packageManager,
  },
  lockfileSha256: sha256(readFileSync("pnpm-lock.yaml")),
  tarball: { filename: packed.filename, sha256: digest },
  distTag:
    release?.distTag ?? (metadata.version.includes("-") ? "next" : "latest"),
};
writeFileSync(
  join(destination, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
copyFileSync(
  "scripts/validate-local.mjs",
  join(destination, "validate-local.mjs"),
);
copyFileSync(
  "docs/LOCAL_VALIDATION.md",
  join(destination, "LOCAL_VALIDATION.md"),
);
if (release)
  writeFileSync(join(destination, "RELEASE_NOTES.md"), release.notes);
const filenames = [
  packed.filename,
  "manifest.json",
  "validate-local.mjs",
  "LOCAL_VALIDATION.md",
  ...(release ? ["RELEASE_NOTES.md"] : []),
];
writeFileSync(
  join(destination, "SHA256SUMS"),
  filenames
    .map(
      (filename) =>
        `${sha256(readFileSync(join(destination, filename)))}  ${filename}\n`,
    )
    .join(""),
);
console.log(
  JSON.stringify(
    {
      sourceCommit,
      version: metadata.version,
      sha256: digest,
      dirty,
      directory: destination,
    },
    null,
    2,
  ),
);
