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
- **Relation column** (database block, `blocksuite/affine/blocks/database/src/properties/relation/`),
  Notion-style:
  - Column type `relation`. Column data `target: { docId, blockId }` = the related database (any
    database block in any doc). A cell stores the related **row ids** of that database.
  - Picker (searchable popup menu, opened like select cells: select the cell, then Enter/click):
    with no target it first lists docs → the doc's databases (auto-picked when there is one);
    then it lists the target's rows to toggle (stays open), with a "Related: … / Change" entry.
  - Cells render rows as tag-like chips; click opens the row's doc (rows whose title links a doc,
    i.e. imported Notion row pages) or else the database's doc.
  - Other docs are read through a readonly `Store` loaded on demand (`target.ts`, cached per
    workspace); `relationStoreTick` re-renders cells/pickers when that data arrives.
  - Entries that are doc ids (v1 values, Text → Relation conversion of `@`-mentions) resolve to the
    row whose title links that doc, and are rewritten as row ids on the next edit. Without a
    target, entries are shown as docs.
  - Converters: Text → Relation keeps `@`-mentioned docs; Relation → Text writes doc ids back as
    `@`-mentions.
  - v1 (`nineday.2`) forgot `customElements.define('affine-database-relation-cell', …)` in
    `effects.ts`, so the cell threw "Illegal constructor" and never rendered.
  - Not yet: two-way relations, rollups/formulas.
  - Official desktop/mobile apps and other clients do not know the `relation` type; use the web app.
- Local testing: `yarn affine @affine/web dev` (port 8080, proxies `/api`, `/graphql`, `/socket.io`
  to `localhost:3010`) + an SSH tunnel to a staging backend whose `externalUrl` is
  `http://localhost:8080` (CORS); use a **local workspace** in the browser so no login is needed.
