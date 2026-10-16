# Claude instructions — azatgames-cryptogram

This repo is implementation for the Azat Technologies broker workflow. Work arrives via Issues in the private vault, `innominatesnap/azattech-grokbots` (see `cross-comms/GITHUB-ISSUES-BROKER.md` and `docs/WORKFLOW.md` there for the full protocol). PRs here should link back to their vault Issue (`Refs AZGB-N`), be opened Ready for review (a Draft must say what it needs from Timothy), and never be merged by Claude — Timothy merges.

## Status visibility rule (adopted 2026-09-29 by Timothy, applies in every repo)

Claude has no Wrike access. Post this block as a comment on the relevant vault Issue (or this repo's PR) when starting work, whenever blocked on Timothy, and when done — Leo mirrors it into Wrike.

```
<!-- azat-status -->
**Status:** Working | Needs Timothy | Done
**Designee:** bot:claude
**Branch:** owner/repo:branch
**Needs from Timothy:** one plain sentence, or "none"
```

- Pick one `Status` value. `Needs Timothy` also means adding the label `state:needs-timothy` on the vault Issue; `Working`/`Done` means removing it.
- `Needs from Timothy` must be answerable with no clicks: yes/no/pick, in plain English. Say what you recommend when you have one.
- The `<!-- azat-status -->` marker must be present so Leo's routine can find the latest block. Post a new block each time the status changes.

Full detail, including the Wrike field mapping: `docs/WORKFLOW.md` §10 in the vault repo.

## Versioning rule (adopted 2026-10-16 by Timothy)

Never edit the version: don't touch `src/app-version.json` or `package.json`'s `version` in any PR. A GitHub Action bumps it after every merge and tags `vX.Y.Z`. If a change deserves a minor or major bump, say so in the PR body and ask Timothy to add the `version:minor` / `version:major` label. Full policy: `docs/VERSIONING.md`.
