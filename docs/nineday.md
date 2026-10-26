# NineDay fork of AFFiNE

This branch (`nineday`) carries NineDay Studio's changes on top of an official AFFiNE release.
It is deployed to our self-hosted AFFiNE; it is not meant for upstream.

|           |                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Base      | `v0.27.4` (official tag)                                                                                   |
| Image     | `ghcr.io/jim3878/affine:0.27.4-nineday.<N>`, built by `.github/workflows/nineday-image.yml`                |
| Changed   | **Web frontend only** (MIT-licensed code: `blocksuite/`, `packages/frontend/`)                             |
| Unchanged | Backend (`packages/backend`, AFFiNE EE License), admin and mobile frontends: taken from the official image |

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

_None yet: the pipeline was set up on 2026-10-26 with an unmodified frontend to prove the image matches upstream._
