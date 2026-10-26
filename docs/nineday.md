# NineDay fork of AFFiNE

This branch (`nineday`) carries NineDay Studio's changes on top of an official AFFiNE release.
It is deployed to our self-hosted AFFiNE; it is not meant for upstream.

|           |                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Base      | `v0.27.4` (official tag)                                                                              |
| Image     | `ghcr.io/jim3878/affine:0.27.4-nineday.<N>`, built by `.github/workflows/nineday-image.yml`           |
| Changed   | **Web and mobile-web frontends only** (MIT-licensed code: `blocksuite/`, `packages/frontend/`)        |
| Unchanged | Backend (`packages/backend`, AFFiNE EE License) and the admin frontend: taken from the official image |

## Rules

- Only change MIT-licensed frontend code. Do not modify `packages/backend` or `packages/common/native`
  (AFFiNE Enterprise Edition License: modified versions need an EE subscription for production use).
- Every feature is its own commit (or small series) so it can be rebased onto a newer release.
- Upstream workflows are removed on this branch (they need upstream secrets); only `nineday-image.yml` runs.

## Upgrading to a new AFFiNE release

1. `git fetch upstream --tags`
2. `git rebase --onto vX.Y.Z v0.27.4 nineday` (re-apply our commits on the new tag; keep upstream workflow deletions)
3. Update `AFFINE_BASE_VERSION` in `.github/workflows/nineday-image.yml` and the Base line above.
4. Push, then test the new image on the staging container before production.

## Local development (Windows)

Requires Node 22 (`E:\Dev\tools\node22`), Rust 1.97.1, Windows Developer Mode.

```bash
export PATH="/e/Dev/tools/node22:$PATH" YARN_GLOBAL_FOLDER='E:\Dev\tools\yarn-global' COREPACK_HOME='E:\Dev\tools\corepack'
yarn install
BUILD_TYPE=stable yarn affine @affine/web build      # ~30 s
```

## Changes

- `0.27.4-nineday.1` (2026-10-26): pipeline only, unmodified frontend; verified identical to upstream.
- **Relation column** (database block, `blocksuite/affine/blocks/database/src/properties/relation/`):
  - Column type `relation`. A cell stores an array of related doc ids (any non-trashed doc in the
    workspace, e.g. another database's row pages). JSON/filter value: the doc titles.
  - Cell shows the docs as chips (click opens the doc); editing opens a searchable doc picker
    (toggle to add/remove; selected docs listed first).
  - Converters: Text → Relation takes the `@`-mentioned docs of each cell; Relation → Text writes
    them back as `@`-mentions, so switching types does not lose data.
  - Not yet: restricting the picker to one database's rows, two-way relations, rollups.
  - Official desktop/mobile apps and other clients do not know the `relation` type; use the web app.
