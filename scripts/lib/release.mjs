import { createHash } from "node:crypto";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export function releaseDetails(tag, metadata, changelog) {
  if (metadata.name !== "@hechtcarmel/vertica-mcp")
    throw new Error("Unexpected package identity");
  if (
    !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
      tag,
    )
  ) {
    throw new Error(
      "Release tag must be vMAJOR.MINOR.PATCH with an optional prerelease suffix",
    );
  }
  if (tag !== `v${metadata.version}`)
    throw new Error("Tag and package version do not match");
  const heading = `## [${metadata.version}]`;
  const start = changelog
    .split("\n")
    .findIndex((line) => line === heading || line.startsWith(`${heading} - `));
  const lines = changelog.split("\n");
  if (start === -1)
    throw new Error("A versioned changelog section is required");
  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );
  const notes = lines
    .slice(start + 1, next === -1 ? undefined : next)
    .join("\n")
    .trim();
  if (!notes) throw new Error("Release notes cannot be empty");
  return {
    notes: `${notes}\n`,
    distTag: metadata.version.includes("-") ? "next" : "latest",
  };
}

export function verifyArtifact(manifest, bytes, expectedDigest) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? ""))
    throw new Error("An explicit SHA-256 from the Mac validation is required");
  if (manifest.dirty !== false)
    throw new Error("A dirty working tree cannot be released");
  if (!/^[a-zA-Z0-9._-]+\.tgz$/.test(manifest.tarball?.filename ?? ""))
    throw new Error("Invalid tarball filename");
  if (
    manifest.tarball.sha256 !== expectedDigest ||
    sha256(bytes) !== expectedDigest
  ) {
    throw new Error("Artifact does not match the locally validated SHA-256");
  }
}
