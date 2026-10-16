# Versioning — CryptoGram

The version in the in-app footer ("CryptoGram vX.Y.Z") is **the** build reference. Release notes, bug reports, and bots all quote it. This is the same policy as Azat Poker (`azattechpoker/docs/VERSIONING.md`), adopted repo-by-repo across every Azat product (vault `docs/WORKFLOW.md` §12).

## The rule

**Nobody edits the version by hand — not Claude, not Grok bots, not humans.** PRs never touch `src/app-version.json` or the `version` field in `package.json`. A PR that does should be fixed before merge.

## How it moves

1. A PR is merged into `main`.
2. `.github/workflows/version.yml` runs and bumps the version (patch by default), writes it to `src/app-version.json` (what the footer label reads, via `src/lib/buildInfo.ts`) and mirrors it into `package.json`.
3. It commits `chore(release): vX.Y.Z` to `main` and tags that commit `vX.Y.Z`.
4. Vercel skips the production build of the plain merge commit (`scripts/vercel-ignore.sh`) and deploys the release commit. **The live footer version always equals the newest tag.** Preview deployments still build for every PR.

Because only one serialized job (`concurrency: version-bump`) ever writes the version, and only after merge, PRs can never conflict over it.

## Bigger bumps

Add a label to the PR before merging:

| Label | Effect | Example |
|---|---|---|
| (none) | patch | 0.1.0 → 0.1.1 |
| `version:minor` | minor | 0.1.0 → 0.2.0 |
| `version:major` | major | 0.1.0 → 1.0.0 |

To bump without a PR (e.g. a direct push), run the **Version bump** workflow manually from the Actions tab and choose patch/minor/major.

## Release notes

Each release note's **Version** field is the footer version of the build that shipped the change (e.g. `0.1.1`), not a date.

## Build SHA

Hovering the footer version shows the short commit SHA of the deployed build (from Vercel's `VERCEL_GIT_COMMIT_SHA`).

## If something goes wrong

- **Workflow failed** → production didn't deploy that merge. Re-run the failed "Version bump" job (or run it manually). Nothing else to fix.
- **Need an emergency deploy without a bump** → redeploy the latest release commit in Vercel, or run the workflow manually.
- Repo setting needed: Settings → Actions → General → Workflow permissions must allow the workflow to write (it asks for `contents: write` itself).
- Repo setting needed: labels `version:minor` and `version:major` must exist on this repo for the PR-label picker above to work (create them once in Settings → Labels if missing).
