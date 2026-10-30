# Copilot instructions — Codemap

Read `HANDOFF.md` first: it is the spec (data model, scanner rules, screens, tokens, task list). `fixtures/products-slug.scan.json` is the reference data the UI must render.

## Stack
- pnpm workspaces + Turborepo. Packages: `apps/web`, `packages/schema`, `packages/scanner`.
- Next.js App Router, React, TypeScript (`strict: true`), Tailwind CSS.
- `@xyflow/react` + `elkjs` for the graph, `d3-hierarchy` for the treemap, `ts-morph` in the scanner, `zod` for validation.
- Vitest for unit tests, Playwright for E2E.

## Conventions
- TypeScript only. No `any`; use `unknown` + narrowing. Shared types come from `@codemap/schema` — never redefine them.
- Server Components by default. Add `'use client'` only to the smallest interactive leaf (graph canvas, toggles, panels with hover state).
- All view state lives in the URL (search params), read with `useSearchParams` / page `searchParams` and updated with `router.replace`. No global client store.
- Styling with Tailwind using the CSS variables in `HANDOFF.md` §6 (`bg-[var(--panel)]` or theme extension). Colour only encodes node kind; selection uses `--fg`; warnings use `--warn` plus an icon.
- Accessibility: interactive elements are `<button>` or `<a>`, never clickable `<div>`s. Toggles use `aria-pressed`, tabs use `aria-current`, icon-only buttons have `aria-label`, panels that change on selection use `aria-live="polite"`. Visible focus rings. Contrast ≥ 4.5:1.
- Edges always point the way data moves (`from` = origin of the data).
- Every scanner finding carries a `SourceRef { file, line }`. Never drop a finding silently: emit a `Diagnostic` instead.
- Keep components small: one file per node type, edge type, panel section.
- Tests: each scanner rule gets a Vitest case against `packages/scanner/test-fixtures/`; each screen gets a Playwright smoke test against the fixture.

## Commands
- `pnpm dev` — run the web app against the fixture
- `pnpm lint && pnpm typecheck && pnpm test` — must pass before a PR
