import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import console from "node:console";
import { verifyArtifact } from "./lib/release.mjs";
const { values } = parseArgs({
  options: {
    directory: { type: "string", default: "artifacts" },
    sha256: { type: "string" },
  },
});
const manifest = JSON.parse(
  readFileSync(join(values.directory, "manifest.json"), "utf8"),
);
if (!/^[a-zA-Z0-9._-]+\.tgz$/.test(manifest.tarball?.filename ?? ""))
  throw new Error("Invalid tarball filename");
verifyArtifact(
  manifest,
  readFileSync(join(values.directory, manifest.tarball.filename)),
  values.sha256,
);
console.log(`Verified ${manifest.version}: ${manifest.tarball.sha256}`);
