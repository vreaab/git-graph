# Handoff: GitKraken-style commit graph with CI status

**For:** GitHub Copilot (coding agent or Copilot Chat in agent mode)
**Stack:** Next.js App Router · TypeScript (strict) · React · Tailwind CSS · pnpm
**Design reference:** `design-reference.html` in this folder is the approved interactive mockup. Its `<script>` block holds the routing math, mock data, and every color and size. Match it visually. Do not copy its templating syntax (`{{ }}`, `<sc-for>`, `<x-dc>`); it is a design-tool format, not React.

---

## 1. Goal

Build a commit graph view for a web app. It must handle **thousands of commits and dozens of concurrent branches**. The screen has three panels:

1. **Left sidebar:** repo name, collapsible **Branches** list and **Tags** list.
2. **Center:** toolbar plus a virtualized commit table. The table has these columns: Branch/Tag labels | Graph | Commit message | (optional) Commit · Author · Date.
3. **Right panel:** details for the selected commit, including CI checks.

## 2. Suggested file structure

```
app/(app)/repos/[owner]/[repo]/graph/page.tsx     // server component: loads initial data
components/git-graph/
  GitGraphView.tsx          // client: layout of the 3 panels + state
  Sidebar.tsx
  GraphToolbar.tsx          // current branch, commit count, CI summary chips
  CommitTable.tsx           // virtualized rows + sticky column header
  CommitRow.tsx
  GraphCell.tsx             // per-row SVG slice of the graph
  RefLabels.tsx
  WipRow.tsx
  CommitDetails.tsx
  ChecksList.tsx
  CiStatusIcon.tsx
lib/git-graph/
  types.ts
  layout.ts                 // lane assignment + per-row segments (pure, unit-tested)
  layout.test.ts
  ci.ts                     // aggregate status helpers
  mock-data.ts              // the 12 commits from the mockup
lib/github/
  checks.ts                 // fetch check runs per commit
```

## 3. Data model (`lib/git-graph/types.ts`)

```ts
export type Sha = string;

export interface Commit {
  sha: Sha;
  shortSha: string;          // 7 chars
  summary: string;           // first line of the message
  body?: string;             // rest of the message, shown dimmed inline
  author: { name: string; email: string; avatarUrl?: string };
  committedAt: string;       // ISO
  parents: Sha[];            // first parent = mainline
}

export interface BranchRef { name: string; tip: Sha; isHead: boolean; isRemote: boolean }
export interface TagRef    { name: string; target: Sha }

export type CiStatus = 'success' | 'failure' | 'running' | 'queued' | 'skipped';

export interface CheckRun {
  id: string;
  name: string;              // e.g. "CI / build & test"
  event: 'push' | 'pull_request' | 'release' | string;
  status: CiStatus;
  jobsSummary: string;       // e.g. "4/6 jobs", "lint failed · 5/6 jobs"
  durationLabel: string;     // e.g. "1m 42s"
  progress?: number;         // 0–100 while running
  htmlUrl?: string;
}

// Output of layout.ts
export interface GraphRow {
  sha: Sha;
  lane: number;
  color: string;
  isMerge: boolean;
  segments: Segment[];       // everything to draw inside this row's graph cell
}
export type Segment =
  | { kind: 'vertical'; lane: number; from: 'top' | 'mid'; to: 'mid' | 'bottom'; color: string }
  | { kind: 'mergeOut'; fromLane: number; toLane: number; color: string }   // leaves node sideways, curves down
  | { kind: 'branchIn'; fromLane: number; toLane: number; color: string };  // comes down a lane, curves into node
```

## 4. Lane assignment (`layout.ts`). This is the core work.

The mockup hard-codes `track` per commit. The real app must compute lanes. Commits come in **topological order, newest first** (`git log --topo-order`).

Algorithm (standard "active lanes" sweep):

1. Keep `active: (Sha | null)[]`. Each slot holds the sha that a lane is waiting for.
2. For each commit `c`:
   - `lane` = the leftmost index where `active[i] === c.sha`. If there is none, use the first `null` slot, or append a new one.
   - Any **other** slots that also wait for `c.sha` are branches converging here. Emit `branchIn` segments from those lanes into `lane`, then set them to `null`.
   - First parent: `active[lane] = parents[0]`. No parents means `active[lane] = null`.
   - Each additional parent `p` (a merge): if `p` is already in `active`, reuse that lane. Otherwise put it in the first free slot. Emit a `mergeOut` segment from `lane` to that slot.
   - Every slot that is still non-null and is not the node lane gets a straight `vertical` pass-through segment for this row.
3. Lane color = `LANE_COLORS[lane % LANE_COLORS.length]`. Lane 0 is the mainline.
4. Keep lanes stable. Do not compact lanes when a slot frees up mid-graph. Reuse freed slots only for new branches.

Write unit tests with the mockup's 12 commits. Expected lanes: main = 0, `feature/auth` = 1, `hotfix/db-pool` = 2, `feature/ui-refresh` = 3. Also test a long linear history and an octopus merge.

## 5. Rendering spec (match `design-reference.html`)

**Per-row SVG.** Render the graph as one small SVG per row (`GraphCell`) built from that row's `segments`, **not** one giant SVG. This lets rows virtualize. Use `@tanstack/react-virtual` with a fixed row height.

Default sizes (make them props or constants):

| Token | Value |
|---|---|
| Row height | 28px |
| Branch/Tag column | 160px |
| Graph column | 240px |
| Lane width | 24px, first lane centre at x = 16 |
| Edge stroke | 1.75px, round caps, curve radius `min(8, |dx|)` (quadratic) |
| Commit node (avatar) | r = `clamp(5, rowHeight/2 − 5, 8)`, fill = lane color @ 18% alpha over the background, 1.5px lane-color stroke, author initials centered in the lane color, font size = r × 0.9 |
| Merge node | r = 3, solid lane color |
| Selected ring | r + 2.5, 1.25px stroke, 90% opacity |
| Lane bar | rect from the node x to the end of the graph column, inset 3px top and bottom, lane color @ 12% (30% when selected), plus a 2px solid cap at the column's right edge |
| Ref connector | 1.5px line in the branch color from the label column (x = 12) to the node's edge |

**Edge shapes:**
- Same lane: straight vertical.
- `mergeOut` (child lane < parent lane): horizontal from the node to the target lane, then a curve down, then vertical.
- `branchIn` (child lane > parent lane): vertical down the child lane, then a curve into the parent node horizontally.

**Colors (dark theme):**

```ts
export const LANE_COLORS = ['#2dd4bf', '#e879f9', '#fbbf24', '#38bdf8', '#a78bfa']; // extend for more lanes
export const BG = '#0d0d12';           // app background
export const PANEL_BG = '#0a0a0f';     // sidebars
export const TEXT = '#e4e4e7';
export const TEXT_MUTED = '#a1a1aa';
export const TEXT_SUBTLE = '#8b8b96';  // smallest grey that passes 4.5:1 on BG
export const BORDER = 'rgba(255,255,255,0.06)';
export const CI_COLORS = { success: '#4ade80', failure: '#f87171', running: '#fbbf24', queued: '#a1a1aa', skipped: '#8b8b96' };
```

**Type:** JetBrains Mono (`next/font/google`), base size 12px. Uppercase 10px column headers with 0.12em letter-spacing.

**Row contents:**
- **Ref labels (left column):** an 18px-tall pill per branch or tag. The branch pill uses the lane color text, a 14% tint background over BG and a 50% border. The HEAD branch gets a 25% tint, bold text and a check icon. Tags are neutral grey with a tag icon. Labels sit above the connector line (z-index), with an opaque background.
- **Message cell:** CI status icon (12px), then the **summary** (bright, truncates last), then the **body** inline in `TEXT_SUBTLE` (truncates first).
- **Optional columns:** short sha, author, relative date. A gear button at the right end of the header toggles them.
- **WIP row (row 0):** shown when the working tree is dirty. Dashed circle on the HEAD lane, a dashed line down to the HEAD commit, a "// WIP" summary input, and counts of modified (pencil, amber) and added (plus, green) files.

## 6. Interactions

- Click a row to select it and open the details panel. Use real `<button>` rows, `aria-pressed` and keyboard focus. Add ↑/↓ arrow-key navigation within the table.
- Hover a row or a sidebar branch to highlight its lane. Every other lane fades: edges and nodes to ~20% opacity, rows to 45%.
- Click a sidebar branch to jump to its tip. Click a tag to jump to its commit. Click a parent chip in details to jump to that commit. Every jump scrolls the row into view (`virtualizer.scrollToIndex`).
- **Details panel:** copy-sha button ("Copied" for 1.4s), author avatar in the lane color, summary plus body, branch pill, "merge commit" badge, parent chips, and the **Checks** list. Has a close button.
- Branches and Tags sidebar sections collapse.
- Phone width: panels wrap and stack, and the table scrolls horizontally inside its own box.

## 7. CI / GitHub Actions status

**Display:**
- Status icon on every commit row: circle-check / circle-x / spinning arc / clock / slashed circle.
- Status icon after each branch name in the sidebar, showing the branch tip's status.
- Toolbar chips "N running" (counts queued and running runs) and "N failing" (counts commits whose aggregate is failure). Clicking a chip selects the first matching commit.
- Details → Checks: one row per run. Each row shows the run name, `event · jobsSummary · duration`, a 3px amber progress bar while running, and a **Re-run** button on failures.

**Aggregate rule (`ci.ts`):** any failure → `failure`, else any running → `running`, else any queued → `queued`, else all skipped → `skipped`, else `success`.

**Data source:**
- `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` per visible commit. Batch these and fetch only rows near the viewport. Alternatively use `GET /repos/{owner}/{repo}/actions/runs?head_sha=…`.
- Re-run: `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs`.
- Use TanStack Query. Set `refetchInterval: 5000` only while any visible run is running or queued, otherwise no polling. Leave a TODO for webhook push (`workflow_run`, `check_run`) later.
- Keep GitHub tokens server-side. Route the calls through a Next.js route handler or server action.

## 8. Performance requirements

- Run lane layout once per history load, in a `useMemo` or a web worker when there are 5k+ commits. It must be O(commits × active lanes).
- Virtualize the rows. Render only the visible window plus overscan. The DOM must stay under ~100 rows.
- Paginate history: load 500 commits at a time, append on scroll, and continue the layout from the saved `active` lanes state.
- No layout thrash on hover. Lane highlighting is driven by one `hoveredLane` state and CSS opacity.

## 9. Acceptance criteria

- [ ] The mockup's 12 commits render identically to `design-reference.html`: lanes, curves, labels, lane bars and CI icons.
- [ ] `layout.ts` has passing unit tests: the mockup history, a linear history, a merge into a branch that is not main, and an octopus merge.
- [ ] 10,000 synthetic commits with 30 branches scroll at 60fps and load in under 1s on a mid-range laptop.
- [ ] Every interaction in §6 works with mouse and keyboard. Icon-only buttons have `aria-label`. Text contrast is ≥ 4.5:1.
- [ ] CI icons, chips and the details Checks list work against mock data. The GitHub fetch sits behind an interface so mocks and the real API can be swapped.
- [ ] Strict TypeScript with no `any`. Tailwind for styling, with design tokens in one file.

## 10. Out of scope (for now)

Export PNG (removed on purpose), diff view, branch compare, drag-to-resize columns, light theme, and fetching git history itself. Use `mock-data.ts` behind a `GitHistoryProvider` interface until the data source is decided.
