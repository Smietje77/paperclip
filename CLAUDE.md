# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Paperclip?

Paperclip is an open-source Node.js server and React UI that orchestrates a team of AI agents to run a business. Agents (Claude Code, Codex, Cursor, Gemini, OpenClaw, etc.) are treated as employees with roles, tasks, heartbeats, and accountability.

## Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Full dev: API server + UI with watch mode (auto-restarts)
pnpm dev:once             # Dev without file watching
pnpm build                # Build all packages (pnpm -r build)
pnpm typecheck            # Typecheck all packages (pnpm -r typecheck)
pnpm test:run             # Run all tests once
pnpm test                 # Run tests in watch mode

# Single test file
pnpm vitest run server/src/__tests__/health.test.ts

# Tests matching a name pattern
pnpm vitest run --reporter verbose -t "issueService"

# Database
pnpm db:generate          # Generate Drizzle migration from schema changes
pnpm db:migrate           # Apply pending migrations

# E2E
pnpm test:e2e             # Playwright headless
pnpm test:e2e:headed      # Playwright with browser

# CLI
pnpm paperclipai run      # One-command bootstrap + start
pnpm paperclipai doctor   # Diagnose setup issues
```

## Architecture

### Monorepo Layout (pnpm 9.15.4, Node 20+)

- **`packages/shared`** (`@paperclipai/shared`) - Shared types, Zod schemas, constants. No runtime deps except zod.
- **`packages/db`** (`@paperclipai/db`) - Drizzle ORM schema (~50 tables), migrations, embedded-postgres client.
- **`packages/adapter-utils`** (`@paperclipai/adapter-utils`) - Core adapter interfaces (`ServerAdapterModule`, `AdapterExecutionContext`, `AdapterExecutionResult`).
- **`packages/adapters/*`** - One package per AI agent (claude-local, codex-local, gemini-local, openclaw-gateway, opencode-local, pi-local). Each implements `ServerAdapterModule`.
- **`packages/plugins/sdk`** (`@paperclipai/plugin-sdk`) - Plugin system API (`definePlugin`, event bus, job scheduler, state store, UI bridge).
- **`server`** (`@paperclipai/server`) - Express 5 API server. Routes, services, WebSocket realtime, heartbeat scheduler, plugin worker manager.
- **`ui`** (`@paperclipai/ui`) - React 19 SPA with Vite, Tailwind CSS v4, React Router v7, TanStack Query v5, Radix UI.
- **`cli`** (`paperclipai`) - CLI tool (commander). Setup wizard, doctor, DB management, worktree management.

### Key Patterns

**Adapter pattern**: All AI agent integrations implement `ServerAdapterModule` from `@paperclipai/adapter-utils`. Adapters expose three entry points: `./server` (execution), `./ui` (React config forms), `./cli` (stdout formatting).

**In-source TypeScript for dev**: Packages expose `./src/*.ts` directly in dev (no build needed). `tsx` runs source TypeScript. `publishConfig` overrides to `./dist/*.js` at publish time.

**Plugin system**: Plugins run as isolated worker processes. Server spawns workers and handles RPC via `@paperclipai/plugin-sdk`.

**Embedded PostgreSQL**: No external DB setup needed. Auto-managed at `~/.paperclip/instances/default/db`. Set `DATABASE_URL` for external Postgres.

**Deployment modes**: `local_trusted` (default dev, no auth) and `authenticated` (Better Auth sessions).

### Server Structure

Routes live in `server/src/routes/` (one file per domain), business logic in `server/src/services/`. Express app is assembled in `server/src/app.ts`, server boots in `server/src/index.ts` (starts embedded Postgres, applies migrations, starts HTTP).

### UI Structure

Pages in `ui/src/pages/`, shared components in `ui/src/components/` (shadcn/ui pattern under `components/ui/`), API client functions in `ui/src/api/`, React context in `ui/src/context/`. Routes defined in `ui/src/App.tsx`.

### Test Projects

Vitest multi-project config covers: `packages/db`, `packages/adapters/opencode-local`, `server`, `ui`, `cli`. Integration tests use embedded PostgreSQL per-suite.

## Lockfile Policy

Do NOT commit `pnpm-lock.yaml` in pull requests. CI owns lockfile updates. The `master` branch regenerates it automatically.

## PR Guidelines

Include a "thinking path" in PR descriptions that explains from the top of the project down to what was changed (see CONTRIBUTING.md for examples).


---

## Karpathy Coding Principles

> Behavioral guidelines to reduce common LLM coding mistakes, derived from Andrej Karpathy's observations on LLM pitfalls.
> Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked. No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- If you write 200 lines and it could be 50, rewrite it.
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken. Match existing style.
- If you notice unrelated dead code, mention it — don't delete it.
- Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
- Transform tasks into verifiable goals with concrete checks.
- For multi-step tasks, state a brief plan: `[Step] → verify: [check]`
- Strong success criteria let you loop independently. Weak criteria require constant clarification.
