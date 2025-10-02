# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm workspaces (`pnpm-workspace.yaml`).
- `projects/app` — Next.js UI + API routes. Env in `projects/app/.env.template` → copy to `.env.local`.
- `packages/` — shared libraries:
  - `packages/global` (types, common, SDK), `packages/service` (server logic, workers), `packages/web` (React components, hooks, styles).
- `test/` — Vitest setup, fixtures, and integration tests. Additional tests under `projects/*/test`.
- `scripts/`, `deploy/`, `plugins/`, `document/` — tooling, Docker, extensions, docs.

## Build, Test, and Development Commands
- `pnpm i` — install all workspace deps (Node ≥ 20). If snapshot error: `NODE_OPTIONS=--no-node-snapshot pnpm i`.
- `cd projects/app && pnpm dev` or `make dev name=app` — run the app locally.
- `pnpm test` — run Vitest suite; `pnpm test:workflow` runs workflow tests.
- `pnpm lint` — ESLint; `pnpm format-code` formats TS/TSX/SCSS.
- Docker image: `make build name=app image=<repo/fastgpt:tag> [proxy=taobao|clash]`.

## Coding Style & Naming Conventions
- TypeScript strict mode; 2‑space indent, single quotes, semicolons, print width 100 (see `.prettierrc.js`).
- Prefer type‑only imports (`@typescript-eslint/consistent-type-imports`).
- React component files PascalCase (e.g., `NodeInputSelect.tsx`); variables/functions camelCase; constants UPPER_SNAKE_CASE.

## Testing Guidelines
- Framework: Vitest with V8 coverage enabled (see `vitest.config.mts`).
- Place tests in `test/cases/**/*.test.ts` or `projects/<name>/test/**/*.test.ts`.
- Name files `*.test.ts`; keep tests hermetic; use provided setup in `test/setup.ts`.
- Aim to keep coverage from decreasing; update fixtures under `test/datas` if needed.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `perf:`, `chore:`, `docs:` (e.g., `fix: static file /deploy/*`).
- PRs must: describe the change and rationale, link issues, include screenshots/GIFs for UI, update docs/config when needed, and pass lint/tests.

## Security & Configuration Tips
- Copy `projects/app/.env.template` to `.env.local` and fill required secrets.
- Do not commit secrets; rely on `.gitignore` and per‑env files.
## Language
- 使用中文与用户进行交流
