# Phase 5: Dashboard

## Objective
One screen that makes the system obvious: live gateway state on the left, the ops chat on the right. A reviewer understands what Backstop does within 10 seconds of opening it.

## Read first
- The starter's React components and Tailwind setup
- `src/api` response shapes for overview, repos, queue, incidents, chaos

## Design notes
- Poll `/api/overview` every 2 seconds while the tab is visible. Do not add a state library.
- Components under `src/ui/` (or the starter's equivalent), one component per file.
- Clean and calm: neutral colours, one accent, clear state colours (normal, degraded, open). Works in light and dark.
- UI copy is plain language, no em dashes.

## Tasks

### 5.1 Layout
- Header: project name, one-line explanation, namespace switch (Demo, Live). Live shows a note that controls need an admin token.
- Two columns on desktop (dashboard, chat). Stacked on mobile with the chat below.
- Reuse the starter's chat components in the right column.
- **Done when:** layout renders on 375 px and 1440 px widths without horizontal scroll.
- **Commit:** `feat(ui): add dashboard and chat layout`

### 5.2 Overview cards
- Requests per minute, cache hit rate, upstream calls avoided (count and percent), queue depth, repos degraded.
- A `useOverview(namespace)` hook with polling that pauses when the tab is hidden.
- **Done when:** cards update live while running demo requests from curl.
- **Commit:** `feat(ui): add live overview cards`

### 5.3 Repos and timeline
- Repo table: name, breaker state pill, error rate, p95 latency, cache hit rate, queue depth, and a small inline SVG sparkline of error rate.
- Event timeline for the selected repo: breaker transitions, chaos changes, queue and replay events, incident summaries, newest first.
- **Done when:** selecting a repo shows its timeline. Breaker changes appear within 2 seconds.
- **Commit:** `feat(ui): add repo table and event timeline`

### 5.4 Chaos and queue panels
- Chaos panel: Normal, Errors 50%, Slow, Blackout. Demo only unless an admin token is entered (kept in memory, never persisted).
- Queue panel for the selected repo: items with status, attempts, last error. Retry and drop buttons.
- **Done when:** blackout from the UI opens the breaker. Queued writes appear and drain after recovery.
- **Commit:** `feat(ui): add chaos controls and queue panel`

### 5.5 Polish
- Empty, loading and error states for every panel. No layout shift when data arrives.
- Accessible labels, focus styles, sufficient contrast, keyboard use for all controls.
- Dark mode.
- **Done when:** a manual pass at both widths in both themes finds no broken state. No console errors or warnings.
- **Commit:** `feat(ui): polish states, accessibility and dark mode`

## Phase exit gate
- With demo curls running, the dashboard shows hits climbing. Blackout from the UI shows the breaker opening, STALE reads, queued writes, then recovery and drain.
- Chat and dashboard agree on numbers.
- Deploy (ask first) and repeat on the deployed URL.
