# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Obsidian plugin that registers a **Kanban view type for Obsidian Bases** (`.base` files). This checkout is a fork (`origin` = mattbowers, `upstream` = mderazon); `manifest.json` uses plugin id `base-board-dev` so it can coexist with the upstream plugin in a vault.

## Commands

```bash
npm run dev        # esbuild watch → ./main.js with inline sourcemaps
npm run build      # tsc typecheck + production bundle → ./main.js
npm run lint       # tsc typecheck + eslint (eslint-plugin-obsidianmd); CI runs this on release
npm test           # vitest run --dir tests
npx vitest run tests/order.test.ts          # single test file
npx vitest run tests/order.test.ts -t "keys" # single test by name
npm run deploy     # build, then plain-copy main.js/manifest.json/styles.css into a vault
                   # (scripts/deploy.sh [vault-path] [--no-build]; never touches data.json)
```

Releases are built by `.github/workflows/release-plugin.yml` on tag push (lint → build → attach `main.js`, `manifest.json`, `styles.css`). `npm version` runs `version-bump.mjs` to sync `manifest.json`/`versions.json`.

## Architecture

- **Entry (`src/main.ts`)**: `BaseBoardPlugin` calls `registerBasesView("kanban", …)` with a `KanbanView` factory, registers the settings tab, the "Create new board" / promote-task commands, a CodeMirror editor extension (promote icon on checkbox lines), and a debounced vault `rename` handler that rewrites folder paths inside `.base` filters (`folder-rename.ts`). Plugin-level data (`data.json`) holds only `columnConfigs` and `taskFolder`.
- **View (`src/kanban-view.ts`)**: `KanbanView extends BasesView`. Bases owns querying/grouping; the view renders `this.data.groupedData` and delegates to three managers: `ColumnManager` (`column.ts`), `CardManager` (`card.ts`), `DragDropManager` (`drag-drop.ts`), plus `Tags` (`tags.ts`).
  - **Rendering flow**: `onDataUpdated()` is the only fresh-data render path. Writes are wrapped in `applyBatchUpdate()` so intermediate Bases updates are deferred into one debounced render. Drag moves are applied optimistically to the DOM and tracked in `optimisticMoves` / `optimisticColumnOrders` until a later `onDataUpdated()` confirms them.
  - **Per-board state** (column order, collapsed columns, colors, WIP limits, open behaviour, cover property, etc.) is persisted in the `.base` file via `this.config.get/set`; keys are the `CONFIG_KEY_*` constants in `constants.ts`. View-options UI is declared in `KanbanView.getViewOptions()`.
- **Card data lives in note frontmatter**: moving a card writes the group-by property; ordering is a fractional-index string in `kanban_order` (`ORDER_PROPERTY`, `order.ts` using `fractional-indexing`). Legacy numeric orders are migrated to string keys on first reorder of that column.
- **Promote checkbox tasks** (`promote-task.ts`): parses lines with `task-line.ts`, creates a task note in the folder resolved by `date-tokens.ts` (moment-format path segments like `Tasks/YYYY/MM`), infers a `projects` link via `project-match.ts`, and rewrites the source line to a wikilink.

### Testing

Tests in `tests/` only cover the pure modules that don't import `obsidian` (`order`, `task-line`, `project-match`, `date-tokens`, `value-utils`). There is no Obsidian mock; to unit-test new logic, put it in an obsidian-free module. UI/view behaviour is verified manually in a vault (`npm run dev` writes `main.js` to the repo root; `PLUGIN_DEV_DIR` in `esbuild.config.mjs` can point it at a vault plugin folder).

## Repo conventions

- `main.js` and `data.json` are gitignored build output / local settings — don't commit them.
- `AI-INSTRUCTIONS-TEMPLATE.md` is end-user documentation (a template for users' own vaults on how AI agents should edit task notes), not instructions for working on this codebase.
- Keep `README.md` feature docs in sync when adding user-facing behaviour.
