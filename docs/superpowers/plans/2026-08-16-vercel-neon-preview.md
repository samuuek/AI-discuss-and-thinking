# Vercel + Neon Preview Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a free preview of Siyu on Vercel with persistent data stored in Neon Postgres while preserving the existing local SQLite workflow.

**Architecture:** Keep the current React/Vite frontend and local Node server. Extract the request router into an async handler shared by the local server and a Vercel function. Select a Neon-backed async store when `DATABASE_URL` exists and retain SQLite locally.

**Tech Stack:** React, Vite, Node.js, Vercel Functions, Neon Postgres, `@neondatabase/serverless`, Vitest.

## Global Constraints

- Never commit or print `DATABASE_URL`.
- Keep local SQLite behavior working without `DATABASE_URL`.
- Deploy to a Vercel preview first, not production.
- Use the Neon free project `soft-voice-01969649`, database `neondb`.
- Do not configure paid resources or a custom domain.

---

### Task 1: Async API contract

**Files:**
- Modify: `server/http.mjs`
- Modify: `server/api.test.mjs`

**Interfaces:**
- Consumes: existing store methods.
- Produces: an exported async `handleApiRequest(request, response, options)` used by both Node and Vercel.

- [ ] **Step 1: Write a failing API test** using a store whose `listTopics()` returns a Promise; assert `GET /api/topics` returns the resolved array rather than a Promise-shaped value.
- [ ] **Step 2: Run `npx vitest run server/api.test.mjs`** and confirm the response is wrong before implementation.
- [ ] **Step 3: Extract the route callback and await every store operation** while keeping `createApiServer()` as the local adapter.
- [ ] **Step 4: Run `npx vitest run server/api.test.mjs server/database.test.mjs`** and confirm all API and SQLite tests pass.

### Task 2: Neon Postgres store

**Files:**
- Create: `server/postgres-store.mjs`
- Create: `server/postgres-store.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `DATABASE_URL` and the same public method names exposed by `createDatabase()`.
- Produces: `createPostgresStore(sql)` with async topic, workspace, message, weekly, backup, and restore methods.

- [ ] **Step 1: Write failing store contract tests** with a deterministic query adapter covering topic creation, workspace persistence, message idempotency, and weekly analysis upsert.
- [ ] **Step 2: Run `npx vitest run server/postgres-store.test.mjs`** and confirm the module is missing.
- [ ] **Step 3: Install `@neondatabase/serverless` and implement parameterized Postgres queries** with no secret logging.
- [ ] **Step 4: Run the Postgres contract tests** and confirm they pass.

### Task 3: Vercel function entry

**Files:**
- Create: `api/index.mjs`
- Create: `api/index.test.mjs`
- Create: `vercel.json`
- Modify: `server/index.mjs`

**Interfaces:**
- Consumes: `handleApiRequest`, `createPostgresStore`, `DATABASE_URL`.
- Produces: a single Node.js Vercel function for `/api/*` and SPA fallback rewrites for all frontend routes.

- [ ] **Step 1: Write a failing handler test** asserting the function returns a successful `/api/health` response with an injected async store.
- [ ] **Step 2: Run `npx vitest run api/index.test.mjs`** and confirm the entry module is missing.
- [ ] **Step 3: Implement the cached Neon client/store and Vercel handler**; add rewrites and Node runtime configuration.
- [ ] **Step 4: Run handler tests and `npm run build`**.

### Task 4: Neon schema migration

**Files:**
- Create: `server/schema.sql`

**Interfaces:**
- Consumes: empty Neon `neondb` database.
- Produces: tables `topics`, `workspaces`, `messages`, `weekly_items`, `weekly_source_status`, `weekly_analyses` plus two indexes and three seed topics.

- [ ] **Step 1: Add idempotent PostgreSQL DDL** using `CREATE TABLE IF NOT EXISTS`, foreign keys, checks, and `ON CONFLICT DO NOTHING` seeds.
- [ ] **Step 2: Present the SQL impact summary and request explicit approval** before executing it through Neon.
- [ ] **Step 3: Run the approved SQL transaction** on branch `br-shiny-thunder-af2oq7ij`.
- [ ] **Step 4: Describe the branch and verify all six tables and indexes exist**.

### Task 5: Vercel preview deployment

**Files:**
- Create locally (ignored): `.vercel/project.json`
- Create locally (ignored): `.env.local`

**Interfaces:**
- Consumes: built application and Neon connection string.
- Produces: a Vercel preview URL.

- [ ] **Step 1: Create/link a Vercel project named `siyu-thinking-workspace`** in team `team_Wvaex201KZ5Tx15ncHrWvwsg`.
- [ ] **Step 2: Add `DATABASE_URL` to Preview, Production, and Development without printing it** and verify key names only.
- [ ] **Step 3: Run full tests, typecheck, and production build**.
- [ ] **Step 4: Deploy a preview and inspect build logs until status is READY**.
- [ ] **Step 5: Verify `/`, `/api/health`, topic creation, reload persistence, AI 周报, console health, and mobile layout**.

### Task 6: Safe handoff

**Files:**
- Modify: `README.md` if present, otherwise create it.

**Interfaces:**
- Produces: preview URL, free-resource summary, local setup instructions, and rollback notes.

- [ ] **Step 1: Document local SQLite and cloud Neon modes** without secret values.
- [ ] **Step 2: Run `npm test`, `npm run typecheck`, and `npm run build` again**.
- [ ] **Step 3: Commit deployment changes and publish them to the existing GitHub feature branch without exposing `exports/` or `output/`**.
- [ ] **Step 4: Report Vercel URL, Neon project, migration status, and remaining free-tier limits**.
