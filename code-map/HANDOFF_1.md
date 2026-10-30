# Codemap — handoff to GitHub Copilot

Build **Codemap**: a local tool that scans a Next.js (App Router) repo and shows, in a web UI, how the code is connected and how data flows through it.

- **Visual reference:** the clickable prototype on the Claude design canvas (4 screens: Graph, Routes, Data flow, Bundle):
  https://claude.ai/code/artifact/1835719a-707e-411f-b734-707906d806ad *(private — the owner must share it before others can open it)*
- **Sample data:** `fixtures/products-slug.scan.json` is the exact data the prototype shows. Build the UI against it first, then replace it with real scanner output.
- **Repo conventions:** `.github/copilot-instructions.md`.

---

## 1. Goals and non-goals

**Goals**

1. Answer "where does this data come from, where does it go, and what invalidates it?" for any route.
2. Explain *why*: why a route is dynamic, why a package is in the client bundle, where props cross from server to client.
3. Stay usable on real apps (200+ components) — focus on a node and show N hops, never a full hairball by default.

**Non-goals (v1)**

- Pages Router (`pages/`) support.
- Runtime tracing / production telemetry. Everything is static analysis plus build output.
- Editing code from the UI (only "open in editor" links).

---

## 2. Architecture

```
codemap/                      pnpm + Turborepo monorepo
├─ apps/web                   Next.js App Router UI (reads a ScanResult)
├─ packages/schema            TypeScript types + zod schema for ScanResult
├─ packages/scanner           ts-morph based analyzer + CLI (`codemap scan`, `codemap dev`)
└─ fixtures/                  sample ScanResult JSON
```

Flow:

1. `codemap scan <repoPath>` analyzes the target repo and writes `<repoPath>/.codemap/scan.json` (a `ScanResult`).
2. `codemap dev <repoPath>` runs the scan, starts `apps/web` pointed at that file, and watches the repo; on change it marks the scan stale (UI shows "N files changed") and re-scans on request.
3. `apps/web` loads the `ScanResult` in Server Components; client components handle graph interaction.

Suggested libraries (use current stable versions; check compatibility with the Next.js version in use):

| Need | Library |
|---|---|
| AST + type/symbol resolution, tsconfig paths | `ts-morph` |
| Graph canvas | `@xyflow/react` (React Flow) |
| Automatic layered layout | `elkjs` (layered, direction RIGHT) |
| Treemap layout | `d3-hierarchy` (`treemap`, squarify) |
| Schema validation | `zod` |
| File watching | `chokidar` |
| Tests | Vitest (scanner, schema), Playwright (UI) |

---

## 3. Data model (`packages/schema`)

Direction rule used everywhere: **an edge points the way data moves** (`from` = where data starts, `to` = where it ends).

```ts
export type NodeKind =
  | 'middleware'          // middleware.ts or proxy.ts
  | 'layout'
  | 'page'
  | 'server-component'
  | 'client-component'    // file with 'use client' (the boundary) or imported by one
  | 'server-action'       // 'use server' function
  | 'route-handler'       // route.ts
  | 'data-source'         // CMS, DB, external API (detected via adapters)
  | 'unresolved';         // import the scanner could not follow

export type EdgeKind =
  | 'request'     // middleware -> layout
  | 'props'       // parent -> child (render tree), payload = prop names/types
  | 'import'      // unresolved / non-render import
  | 'data-read'   // data-source -> component
  | 'data-write'  // client -> server action, server action -> data-source
  | 'invalidate'; // server action -> data-source/cache tag

export interface SourceRef { file: string; line: number }

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;               // display name, e.g. "page.tsx", "AddToCartButton", "addToCart()"
  source: SourceRef;
  routes: string[];           // routes this node participates in
  suspense?: boolean;         // rendered inside <Suspense> (streamed)
  isClientBoundary?: boolean; // the file that declares 'use client'
  rendering?: string[];       // display chips, e.g. ["ISR", "revalidate: 3600"]
  dataIn?: { fn: string; from: string; note?: string }[];
  invalidatedBy?: string[];   // e.g. ["addToCart() → revalidateTag('product')"]
  note?: string;              // e.g. why it is unresolved
}

export interface EdgePayload {
  name: string;               // prop / arg / tag name
  type?: string;              // TS type text, e.g. "string", "Image[]"
  crossesBoundary?: boolean;  // server -> client prop
  serializable?: boolean;     // only meaningful when crossesBoundary
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;             // short label drawn on the edge
  payload?: EdgePayload[];
  source?: SourceRef;
}

export type Rendering = 'static' | 'isr' | 'dynamic' | 'edge';

export interface RouteInfo {
  id: string;
  path: string;                       // "/products/[slug]"
  kind: 'page' | 'route-handler' | 'group';
  methods?: string[];                 // route handlers
  rendering?: Rendering;
  renderingLabel?: string;            // "ISR · prebuilt", "Dynamic · Node"
  dynamicReason?: { api: string; source: SourceRef; fix?: string };
  revalidate?: number | false;
  tags?: string[];
  segmentFiles: string[];             // ["page","loading","error","not-found"]
  wrappingOrder: { file: string; role: string; boundary: boolean }[];
  params?: { name: string; type: string; source: string }[];
  dataSources: string[];
  middleware?: { matcher: string; note: string } | null;
  firstLoadJsBytes?: number | null;   // null = server only
}

export interface BundleModule {
  id: string;
  name: string;
  bytes: number;
  group: 'shared' | 'route';
  kind: 'framework' | 'client-component' | 'library' | 'chunk';
  importChain: { name: string; kind: 'server' | 'client' | 'library' | 'framework'; note: string }[];
  isNewSinceBase?: boolean;
  suggestions?: { title: string; savingBytes: number; body: string; source: SourceRef }[];
  okNote?: string;
}

export interface RouteBundle {
  route: string;
  firstLoadBytes: number;
  sharedBytes: number;
  routeBytes: number;
  budgetBytes: number;
  deltaVsBaseBytes?: number;
  baseRef?: string;                   // e.g. "main"
  modules: BundleModule[];
}

export interface Diagnostic {
  severity: 'warning' | 'error';
  code: 'dynamic-import' | 'missing-alias' | 'parse-error' | 'unsupported';
  message: string;
  source: SourceRef;
  nodeId?: string;
}

export interface ScanResult {
  version: 1;
  repo: string;
  commit: string;
  scannedAt: string;                  // ISO 8601
  routes: RouteInfo[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  bundles: RouteBundle[];
  diagnostics: Diagnostic[];
}
```

Export a matching zod schema (`ScanResultSchema`) and validate the file on load; show a clear error screen when validation fails.

---

## 4. Scanner (`packages/scanner`)

Use `ts-morph` with the target repo's `tsconfig.json` so path aliases resolve. Every finding must carry a `SourceRef`.

**4.1 Routes**
- Walk `app/` (and `src/app/`). Handle route groups `(name)`, dynamic `[x]`, catch-all `[...x]`, optional `[[...x]]`. Mark parallel (`@slot`) and intercepting (`(.)`) routes as `unsupported` diagnostics in v1.
- Collect segment files per route: `layout`, `page`, `loading`, `error`, `not-found`, `template`, `route`. Build `wrappingOrder` from root layout down to the page.
- Route segment config exports: `dynamic`, `revalidate`, `runtime`, `generateStaticParams`.

**4.2 Rendering mode** (per route; first match wins and becomes `dynamicReason`)
- Dynamic if the page or any layout/component rendered *outside* a `<Suspense>` boundary calls `cookies()`, `headers()`, `draftMode()`, `connection()`, reads `searchParams`, uses `fetch(..., { cache: 'no-store' })`, or `export const dynamic = 'force-dynamic'`.
- ISR if it has a `revalidate` number (segment config or fetch `next.revalidate`) or tag-based caching.
- Edge if `runtime = 'edge'`. Otherwise Static.
- When the dynamic API is inside a component that could be wrapped in `<Suspense>`, set `dynamicReason.fix`.

**4.3 Component graph**
- File-level `'use client'` → `client-component` with `isClientBoundary: true`; everything it imports is client too.
- `'use server'` (file-level or inline in a function) → `server-action` nodes, one per exported async function.
- Render edges (`props`): for each JSX element whose tag resolves to an imported component, add `parent → child` with payload = the props passed (name + TS type text). Set `crossesBoundary` when a server component renders a client component; set `serializable` by checking the prop type (functions, class instances, Symbols, Maps without serialization → not serializable).
- Mark `suspense: true` for components rendered inside `<Suspense>`.
- Template-string `import()` or unresolved module specifiers → `unresolved` node + `Diagnostic`.

**4.4 Data, writes, invalidation** — via pluggable adapters
- Adapter interface: `{ name, matchImport(specifier): boolean, classifyCall(call): 'read' | 'write' | null }`.
- Ship adapters for: `fetch`, Prisma (`@prisma/client`), Drizzle, Sanity (`next-sanity`, `@sanity/client`). Each adapter produces a `data-source` node.
- Reads → `data-read` edge from the data source to the calling component, with tags/revalidate from the call options.
- Writes inside server actions → `data-write` edge action → data source. Client component that calls/binds an action → `data-write` edge client → action (payload = arguments).
- `revalidateTag` / `revalidatePath` / `updateTag` with literal args → `invalidate` edge from the action to every data source/cache entry with that tag; add the text to `invalidatedBy` on affected nodes.
- Middleware: support both `middleware.ts` and `proxy.ts` (newer Next.js versions); parse `config.matcher` and attach to matching routes.

**4.5 Bundle**
- Run (or reuse) a production build of the target repo and read its build output to get first-load JS per route and per module. The available output differs between webpack and Turbopack builds and between Next.js versions — investigate what the installed version emits and implement the reader behind an interface (`BundleReader`). Fall back to `@next/bundle-analyzer` stats with a webpack build if needed.
- Compute `importChain` per module by walking from the route's page through the component graph to the module.
- `deltaVsBaseBytes` / `isNewSinceBase`: compare with a stored scan from a base ref (default `main`).
- Suggestions (v1 rules):
  - A client component that is only shown after user interaction (rendered conditionally on state) and imports a library > 10 kB → "Lazy-load with `next/dynamic`".
  - A validation library (zod, yup, valibot) imported in a client component that calls a server action → "Validate inside the server action".

**4.6 CLI**
- `codemap scan <path> [--out <file>] [--base main]`
- `codemap dev <path> [--port 4321]` — scan, serve UI, watch files, expose `POST /api/rescan` and `GET /api/status` (`{ state: 'fresh' | 'stale' | 'scanning', changedFiles: number, commit, scannedAt }`).

---

## 5. UI (`apps/web`)

### 5.1 Global

- URL structure (all state deep-linkable):
  - `/graph/[...route]?node=<id>&scope=focus|full&hops=2&layers=props,data,writes&types=client,action,data,middleware`
  - `/routes?route=<id>&kind=all|pages|handlers&q=`
  - `/flow/[...route]?scenario=hit|miss`
  - `/bundle/[...route]?module=<id>&compare=1`
- **Header** (same on every screen): logo, breadcrumb (each segment is a link), view tabs (Graph, Routes, Data flow, Bundle) with `aria-current="page"`, search (⌘K opens a command palette over nodes and routes), scan status chip (`role="status"`: dot + "Scanned 4 min ago · a1b2c3f · 2 files changed"; states stale/scanning/fresh), Re-scan button (disabled while scanning).
- Layout: header, then a wrapping flex row: optional left sidebar, main (`flex: 999 1 560px; min-width: 0`), right panel (`flex: 1 1 320px`). Panels stack on narrow screens.
- Every clickable thing is a real `<button>` / `<a>`. Visible focus ring (2px, `--fg`). Live regions (`aria-live="polite"`) on inspector/detail panels.

### 5.2 Graph view

- **Sidebar:** current route + "Pick another route" link; node-type checkboxes (Server always on/disabled; Client, Server action, Data, Middleware); legend (edge styles + node styles, "Arrows point the way data moves"); diagnostics box listing unresolved imports with links that select the node.
- **Toolbar:** Focus / Full graph segmented control; Hops stepper (1–4, disabled in Full); layer toggles (Props, Data, Writes, Client boundary) as `aria-pressed` buttons with a check icon when on and a dashed outline when off; zoom −/+/100%.
- **Canvas:** React Flow with custom node components; ELK layered layout left→right (request → layouts → page → children → data). Focus mode shows the selected node plus N hops; everything else collapses into a "N hidden" cluster node that adds a hop on click. Client boundary layer draws a dashed orange group around client components.
- **Node card:** icon + name (mono) + kind subtitle; colored by kind (see tokens); selected = 2px `--fg` border + soft ring; `suspense` = dashed border; `unresolved` = dashed rose border. Keyboard: Tab between nodes, Enter selects.
- **Edges:** style by kind — request/props solid grey, data-read dashed teal, data-write solid purple, invalidate dashed purple, import dotted rose; short label on each edge (the data's name: "product", "slug", "cart row", "invalidates").
- **Inspector:** kind chip, name, file path; note box (for unresolved); Rendering chips; Data in cards; Props out / Sends / Writes / Feeds list (hover highlights the target node, click selects it; boundary-crossing rows show "Crosses server → client · serializable"); Invalidated by; actions "Open file:line" (`vscode://file/...` link, configurable editor) and "Show data flow →".

### 5.3 Routes view

- Legend with Static/ISR/Dynamic/Edge icons and one-line definitions + docs link.
- Kind filter (All / Pages / Route handlers) and text filter; empty state "No routes match".
- Table (horizontal scroll on narrow screens): Route (tree-indented, route groups shown as a non-selectable group row), Rendering badge (neutral, icon + label, tooltip with reason), Segment files, Data, Middleware, First-load JS with a mini bar vs budget (rose + warning icon when ≥ 90%).
- Selected row: neutral highlight + 3px left inset `--fg`.
- Callout per dynamic route with a `fix`: explanation + "Open file:line" + "Select route".
- **Detail panel:** rendering badge, path, Wrapping order (timeline; filled dot = layout/page, ring = boundary file), Params & caching key/value list, Middleware matcher, links to Graph and Bundle for the route.

### 5.4 Data flow view

- Sequence diagram generated from the graph for the selected route. Lifelines: Browser, Middleware, Server page, Server action, Data.
- Steps, numbered, in two bands:
  - **Page view:** request → middleware (if matched) → page render → each data read (call + result, showing cache hit/miss per scenario and tags) → RSC payload + streamed HTML back to the browser.
  - **Mutation** (one per server action reachable from the route's client components): browser → action (payload) → writes → invalidations → fresh RSC payload.
- Scenario selector: cache hit / cache miss.
- Render with SVG (positions computed from step order); labels as HTML overlays so they stay selectable.

### 5.5 Bundle view

- Route chip + "Other routes" link; "Compare with main" toggle (shows/hides deltas and "new in this branch" badges).
- Stat cards: First-load JS (meter vs budget), Shared by all routes, This route only (+delta), Client components (count with names).
- Treemap (d3-hierarchy squarify) split into Shared and This route; modules < 5% of the route's JS grouped into one "N smaller" tile; tiles are buttons with a `title` showing name + size; selected tile = 2px `--fg` border.
- "Smaller modules" list under the treemap.
- **Insights panel:** "Why is it in the bundle?" — import chain timeline for the selected module; suggestions with saving, explanation and "Open file:line"; or an "ok" note for framework/shared modules.

---

## 6. Design tokens

Dark theme first (light theme later). Fonts: **Inter** (UI), **JetBrains Mono** (code, paths, sizes) via `next/font/google`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0D12` | page background, canvas |
| `--panel` | `#0E1117` | header, sidebars, panels |
| `--surface` | `#151922` | inputs, secondary buttons |
| `--surface-active` | `#232A3A` | active tab/toggle |
| `--border` | `#222734` | panel borders |
| `--border-strong` | `#2E3546` | control borders |
| `--fg` | `#E6E8EE` | text, selection ring, primary button bg |
| `--fg-muted` | `#9AA3B2` | secondary text |
| `--kind-server` | `#6E9BFF` (text `#8FB0FF`) | server components/layouts/pages |
| `--kind-client` | `#F5A35C` (text `#F5B57A`) | client components |
| `--kind-action` | `#B48CFF` (text `#C7A9FF`) | server actions, writes |
| `--kind-data` | `#3FC6B0` (text `#6FD8C6`) | data sources, reads |
| `--kind-middleware` | `#A3ABBA` | middleware / proxy |
| `--kind-handler` | `#F2C46D` | route handlers |
| `--warn` | `#FF8A8A` (text `#FFA3A3`, bg `#1E1214`, border `#6B2A30`) | warnings, unresolved, over budget |
| `--ok` | `#7CCB8A` | fresh scan dot |

Rules: **colour means node kind only.** Rendering modes use neutral badges with icons. Selection is always `--fg`. Warnings always `--warn` plus an icon (never colour alone). Radii: 6px chips, 8–10px controls, 12px cards/panels. Text contrast ≥ 4.5:1.

---

## 7. Work plan (one Copilot task / PR each)

Each task: TypeScript strict, tests included, passes `pnpm lint && pnpm typecheck && pnpm test`.

1. **Scaffold** — pnpm + Turborepo, `apps/web` (Next.js App Router, Tailwind with the tokens above), `packages/schema`, `packages/scanner`, shared tsconfig/eslint.
   *Done when:* `pnpm dev` serves an empty shell; CI workflow runs lint/typecheck/test.
2. **Schema + fixture** — types and zod schema from §3; load and validate `fixtures/products-slug.scan.json`.
   *Done when:* fixture validates; an invalid file shows an error screen in the UI.
3. **App shell** — header, breadcrumb, tabs, scan status (mock `/api/status`), Re-scan state machine, responsive panel layout, URL state helpers.
   *Done when:* tabs navigate with `aria-current`; status cycles stale → scanning → fresh.
4. **Graph view** — §5.2 against the fixture.
   *Done when:* selecting each node updates the inspector; focus/hops/layers/type filters and zoom work; state survives reload via URL; keyboard-only use works.
5. **Routes view** — §5.3.
   *Done when:* filters, selection, detail panel and callout match the prototype for all 7 fixture routes.
6. **Data flow view** — §5.4, steps generated from fixture graph (not hard-coded).
   *Done when:* hit/miss scenarios render; adding an edge to the fixture adds a step.
7. **Bundle view** — §5.5.
   *Done when:* treemap areas are proportional; selecting tiles updates the insights panel; compare toggle works.
8. **Scanner: routes + rendering** — §4.1–4.2 with a test fixture Next.js app under `packages/scanner/test-fixtures/`.
9. **Scanner: component graph** — §4.3 incl. boundary + serializability + unresolved diagnostics.
10. **Scanner: data/writes/invalidation adapters** — §4.4.
11. **Scanner: bundle reader + suggestions** — §4.5.
12. **CLI + watch + rescan API** — §4.6; wire UI to real `/api/status` and `/api/rescan`.
13. **Accessibility + E2E** — axe checks and Playwright flows for every screen.

---

## 8. Open questions for the owner

- Which editor should "Open file:line" target by default (VS Code, Cursor, WebStorm)?
- Default JS budget per route (prototype uses 150 kB)?
- Which data adapters matter most beyond Prisma, Drizzle, Sanity and `fetch`?
- Should `codemap` also run in CI and comment bundle deltas on PRs (v2)?
