# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `npm run dev` — starts Vite dev server with hot reload (renderer + main process)
- **Build + package**: `npm run build` — runs `tsc`, then `vite build`, then `electron-builder`
- **Dep install**: `npm install`

## Architecture

### Process Model (Electron)

Two isolated processes communicate via IPC:

**Main process** (`electron/`):
- `main.ts` — App entry, creates BrowserWindow, registers IPC handlers, manages system tray, hooks Cmd+W
- `preload.ts` — Preload script exposing `window.bamboo.*` APIs to renderer via `contextBridge`
- `bamboo-client.ts` — HTTP client for Atlassian Bamboo REST API (Basic Auth, retry with exponential backoff, pagination)
- `poller.ts` — EventEmitter-based polling engine; polls for all projects or build-specific status on configurable intervals
- `settings.ts` — `electron-store` schema with defaults (Bamboo URL, credentials, polling interval, theme, language, auto-launch)
- `logger.ts` — Structured file logger with timestamp + level prefix
- `tray.ts` — macOS menu bar icon with badge count and context menu (Quit, Open)
- `ipc-handlers.ts` — All IPC handlers: settings CRUD, polling lifecycle, build queuing, getting builds by plan
- `bapi-types.ts` — TypeScript interfaces for Bamboo API responses (REST API v1)

**Renderer process** (`src/`):
- `main.tsx` — React entry point, renders `<App />` inside `<BrowserRouter>`
- `App.tsx` — Layout shell: `<TitleBar>`, `<Sidebar>`, `<ErrorBoundary>`, `<Outlet>` for routed pages
- `lib/bamboo-client.ts` — Renderer-side wrapper around `window.bamboo.*` IPC; also manages state via React Context (projects, builds, loading, errors)
- `lib/usePoll.ts` — React hook that starts/stops IPC-based polling with the main process
- `lib/i18n.ts` — Custom i18n with `useTranslate` hook; dictionaries in `src/locales/` for en, sv, nb, de, fr, es, nl, pl, ptBR, zhCN

### Pages (React Router v6)

| Route | Component | Description |
|---|---|---|
| `/` | `Dashboard` | Project tree, deploy cards, recent builds |
| `/build/:planKey` | `BuildDetail` | Build history, duration chart, artifact links |
| `/settings` | `Settings` | Bamboo URL, credentials, polling, theme, lang, auto-launch |
| `/health` | `Health` | Server status, polling uptime, last fetch times |
| `/logs` | `Logs` | Fetches and displays main-process log file |
| `/login` | `Login` | Bamboo credentials form |

### Key UI Components

- `DeployCard` — Build status card with colored border, plan name, stage progress, timestamp
- `ProjectTree` / `ProjectTreeItem` — Collapsible tree of projects → plans with status dots
- `StatusBadge` — Color-coded badge for build results (Successful, Failed, Running, Unknown)
- `StageProgress` — Horizontal bar showing stage completion
- `BuildHistoryChart` — Recharts line chart of recent build durations
- `DataTable` — Generic sortable table; column config-driven
- `ui/*` — Atomic UI primitives (button, card, badge, input, select, etc.)

### Styling

- Tailwind CSS with a custom `globals.css` that defines CSS variables for light/dark themes
- Theme toggling via `useTheme` context, persisted in electron-store
- System preference detection on first load (`prefers-color-scheme`)

### Data Flow

1. Main process polls Bamboo REST API at the configured interval
2. Results sent to renderer via IPC events (`poll:projects-update`, `poll:build-update`)
3. Renderer stores in React Context (`bamboo-client.ts`'s `BambooProvider`)
4. Components consume context via `useBamboo()` hook
5. Build detail history fetched on-demand via IPC request-response

### Key Patterns

- **Error/loading/empty states**: Every data-fetching component handles all three states
- **IPC bridging**: Preload exposes typed methods; never expose full Node.js APIs to renderer
- **Settings validation**: IPC handlers validate inputs before writing to electron-store
- **Polling abstraction**: `poller.ts` decouples fetch logic from timing; `usePoll` hook manages lifecycle
- **Retry logic**: Bamboo API client retries on failure with exponential backoff (up to 3 attempts)
