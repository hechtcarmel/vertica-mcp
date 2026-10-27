# Releases

Version 2.0.0 is the next major release because this overhaul raises the runtime
minimum to Node 20 and deliberately changes SQL safety behavior. Preparing its
version and artifacts does not publish it.

## Release sequence

1. Make a version PR. Update `package.json`, the pnpm lockfile, and a versioned
   `## [X.Y.Z]` section in `CHANGELOG.md`. Use SemVer: breaking behavior/runtime
   changes are major; additive features are minor; fixes are patches. Use
   `X.Y.Z-rc.N` for a prerelease. Keep unreleased work under `## Unreleased`.
2. Run CI. Its package job waits for quality and runtime jobs, then uploads a
   clean, checksummed bundle with the exact source commit and toolchain manifest.
3. Before merge, complete [Mac read-only validation](LOCAL_VALIDATION.md) using
   those exact bytes and existing connection files. Do not run write-path,
   rejection, mock, or aggregate suites on the Mac. Obtain user acceptance.
4. After explicit merge authorization, merge the reviewed commit. Create and push
   an annotated `vX.Y.Z` tag at the intended release commit. Do not move/reuse
   release tags. Tag pushes alone never publish anything in these workflows.
5. Run **Prepare or publish release** (`release.yml`) at that existing tag.
   Select the same tag as the workflow ref and input tag and the SHA-256 accepted in the Mac report; leave
   `publish` false. It checks the tag/version/changelog, repeats the locked checks
   without dependency caches, rebuilds, and refuses any artifact mismatch. It
   creates a **draft** GitHub release with all assets already attached.
6. Review the draft, assets, checksums, notes, and source commit. If a rebuild
   differs, stop and rerun CI/Mac validation on the new artifact; never waive the
   digest check. Any tag/commit/version correction needs new review.
7. Only with separate publication authorization, rerun the same workflow with
   `publish` true, the same tag, and the accepted digest. It verifies the existing
   draft's tarball, publishes exactly those bytes to npm through OIDC with
   provenance, then publishes the GitHub draft. Stable versions use `latest`;
   prereleases use `next`. No lifecycle scripts execute in the publish job.

The release workflow must run at the exact tag, never a pull request or branch.
It requires the tag commit to be an ancestor of the reviewed default branch.
This also makes npm provenance identify the actual tagged source rather than the
current tip of a different branch. For example, after separate authorization:

```sh
gh workflow run release.yml --ref v2.0.0 \
  --field tag=v2.0.0 --field validated_sha256=THE_ACCEPTED_64_HEX_DIGEST \
  --field publish=false
```

The second authorized dispatch uses the same ref/tag/digest and `publish=true`.
Only the publication job receives `id-token: write`. Only the draft/finalization
jobs receive `contents: write`; build/check jobs are read-only. All action versions
are pinned by commit, and no long-lived npm token is configured or expected.

## Owner setup (not performed by this change)

An owner must separately authorize and configure npm trusted publishing for
`@hechtcarmel/vertica-mcp`, GitHub owner `hechtcarmel`, repository `vertica-mcp`,
workflow filename **`release.yml`**, allowing direct `npm publish`. The workflow
uses GitHub-hosted runners with Node 24.22.1 / npm 11.19.1, satisfying npm's OIDC
minimums. Without that trust relationship, publication must fail; do not add a
fallback token or interactive login to bypass the missing setup.

Consider protected release environments/reviewers, protected version tags, and
GitHub immutable releases as separate owner-approved repository changes. This
implementation does not enable them or change security settings. If immutability
is enabled later, the workflow's draft-first approach attaches all assets before
publication. Never try to overwrite locked assets.

Official references:

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

## Failure recovery

Build, digest, validation, or missing-trust failures stop before publication.
An existing draft is never clobbered in draft-creation mode. If npm succeeds but
GitHub finalization fails, do **not** republish or rebuild: verify the npm version's
integrity against the approved tarball and finalize the existing draft manually
with separate authorization. npm versions cannot be overwritten. A bad published
version needs a new version; any deprecation or dist-tag change is a separate
maintainer action.

## Reproducing an artifact

On a clean reviewed checkout with the pinned release toolchain:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:compatibility
pnpm audit --audit-level=high
pnpm artifact:prepare
```

`artifacts/manifest.json` records source commit/tree, version, Node/npm/pnpm,
lockfile digest, tarball filename, and digest. `SHA256SUMS` also covers the validator
and handoff. No credentials, local env files, test fixtures, or local query results
are included. `--allow-dirty` is for cloud development inspection only and produces
an explicitly dirty manifest that cannot pass release verification.
