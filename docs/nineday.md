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
  - Column header menu (`headerMenu`, see below): "Related database" submenu (docs → databases,
    searchable) and a "Two-way relation" switch.
  - Cell picker (searchable popup menu, opened like select cells: select the cell, then Enter/click):
    lists the target's rows to toggle (stays open); with no target yet it first offers the same
    doc → database chooser.
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
  - The picker's lists scroll (`nineday.4`): the shared context menu caps its height at 700px but
    its body does not scroll, so long row lists spilled out of the menu. The relation picker wraps its
    lists in its own scroll container, and a floating-ui `size()` middleware shrinks it to the space
    left on screen.
  - **Two-way** (`relation/two-way.ts`, `nineday.7`): turning it on adds a mirror column to the
    target database (`mirrorOf: <source column>`; the source gets `backlink`). Only the source
    column's cells are stored; a mirror cell is computed as the source rows that point at the row,
    and editing it rewrites those source cells (through a writable store of the other doc). So the
    sides cannot disagree, and turning two-way off (deleting the mirror) loses no data. Deleting the
    source column deletes its mirror; changing its target turns two-way off first. Within one
    database the mirror is named "<column> (back)", otherwise after the source database.
  - Not yet: rollup as its own column type (use a formula).
  - Official desktop/mobile apps and other clients do not know the `relation` type; use the web app.
- **Formula column** (`blocksuite/affine/blocks/database/src/properties/formula/`), Notion syntax:
  - Column type `formula`, data `{ expression, resultType }`. Values are computed on every read as a
    "spacial property" of the data source (like Created Time) and never stored; `resultType`
    (number/text/boolean/date/list, found from the rows when the formula is saved) drives sort/filter.
  - `parser.ts` (tokenizer + precedence parser; `a.f(b)` = `f(a, b)`; `“…”` quotes accepted),
    `evaluate.ts` (operators and functions: math, `if`/`ifs`/`and`/`or`/`not`/`empty`, text,
    lists with `map`/`filter`/`find`/`some`/`every` binding `current`/`index`, dates, `let`/`lets`),
    `compute.ts` (reads cells by property name: select → option name, relation → rows,
    nested formulas with a self-reference check).
  - Rollups go through relation columns: `prop("Items").map(current.prop("Price")).sum()`; the rows
    of another doc's database are read through the readonly stores in `relation/target.ts`.
  - Editing: select a formula cell and press Enter/click → popup editor with a live preview for
    that row, clickable property names, Enter saves, Shift+Enter new line, Esc cancels.
  - The built-in title property is `prop("Title")` when it is not a named column.
  - User guide (Traditional Chinese): `docs/formula.md`, linked from the editor ("語法說明") via
    its GitHub URL on the `nineday` branch, so the guide can change without rebuilding the image.
- **Property-type header menus** (data-view, `nineday.7`): `Renderer.headerMenu(property, target)`
  lets a property type add items to its column header menu; wired into the table header (pc and
  pc-virtual), mobile table header and the row detail panel via `typeMenuConfig()` in
  `core/common/property-menu.ts`. Used by Relation and Formula ("Edit formula").
- **Submenus open on click** (`components/src/context-menu`, `nineday.8`): context-menu submenus
  (Type, Related database, Number Format, …) no longer open on hover or close when the pointer
  moves to another item; click opens/closes them, a click elsewhere in the menu closes them.
- **Column header selects the column** (data-view table, `pc/header/database-header-column.ts`):
  left click on a column header selects the whole column (all rows of that group) as an area
  selection, so copy, Delete and paste work on it; Shift+click extends the range from the focused
  column. The column menu moved to right click (newly inserted columns still open it to edit the
  name). Only the default table (`pc/`); the experimental virtual-scroll table is unchanged.
- **Columns without `data`** (`blocks/database/src/data-source.ts`, `nineday.10`): columns written
  by other clients (affine-mcp-server writes no `data` for title/rich-text/option-less select
  columns) made the column header menu throw while building the Number Format items, so the
  menu never opened. `propertyDataGet` now falls back to the type's default data.
- **Menus fit the viewport** (`components/src/context-menu`, `nineday.10`): `menuSizeMiddleware`
  (floating-ui `size()`) caps a menu's height to the space left on screen (160–700px) and its
  body scrolls; used by `popMenu`'s default middleware and by submenus (not `autoHeight` ones).
  Before, long menus such as the column menu ran off the bottom of the screen with Delete unreachable.
- **Sticky horizontal scrollbar** (`components/src/sticky-scrollbar`, `nineday.11`): wide tables
  scrolled sideways only with their own scrollbar at the table's bottom edge, so a long table had
  to be scrolled to its end first. `bindStickyScrollbar(scroller, bar, frame)` drives an empty
  element rendered after the table: `position: sticky; bottom: 0`, so it stays at the bottom of
  the viewport while the table is on screen and rests under the table at its end; it mirrors the
  scroller's `scrollLeft` both ways, follows content width with a ResizeObserver (updated in the
  next frame to avoid a ResizeObserver loop), hides when nothing overflows, and the scroller's
  own scrollbar is hidden. Used by the database table view (`pc/`) and the simple table block.
  `nineday.14` fixed jitter while scrolling: positions snap to device pixels, so a copied position
  came back slightly different and its scroll event was copied back onto the element being scrolled,
  pulling it to an older position. Now only differences of 1px or more are copied, and the scroll
  event caused by our own copy is ignored.
- **zh-Hant "Duplicate"** (`packages/frontend/i18n/src/resources/zh-Hant.json`, `nineday.12`):
  `com.affine.header.option.duplicate` was translated as 「製作替身」; now 「建立副本」.
- **Page width "Default"** (`core/src/components/workspace-property-types/page-width.tsx`,
  `nineday.13`): the doc's Page width property only offered Standard / Full width and showed the
  viewer's default when unset, so once clicked a page could never follow the default again. A
  third option, Default (i18n `com.affine.page-properties.property.pageWidth.default`), clears
  the stored value (writes `null`; the doc db skips `undefined`).
- **Embedded doc title size on canvas** (`nineday.15`): a synced doc on the edgeless canvas shows
  its title in a small secondary header. Its toolbar now has a "Title size" menu next to the
  scale menu (Auto, 16–128, or a typed size 8–200), stored on the block as `titleFontSize`
  (`blocks/embed-doc/.../title-size.ts`, `configs/toolbar.ts`). A set size also makes the title
  bold and primary (`core/.../edgeless-block-header/`). The header grows with the title, so the
  folded height and the minimum resize height use `syncedDocHeaderHeight()` instead of the fixed
  48px, and changing the size of a folded block resizes it. Auto clears the prop by assigning it
  inside `store.transact` (`updateBlock` skips `undefined`).
- Local testing: `yarn affine @affine/web dev` (port 8080, proxies `/api`, `/graphql`, `/socket.io`
  to `localhost:3010`) + an SSH tunnel to a staging backend whose `externalUrl` is
  `http://localhost:8080` (CORS); use a **local workspace** in the browser so no login is needed.
