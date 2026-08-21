# Siyu Local Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all clearly identified Siyu desktop artifacts into `D:\AI思屿`, verify the web and WeChat miniapp projects, document safe handoff, and publish only safe current source and documentation to Git.

**Architecture:** Use a structured local archive with separate current-source, historical-package, design, icon, and documentation areas. Generate source snapshots from the tracked Git tree so local secrets and build caches are excluded, while desktop artifacts are moved only after exact source and destination validation.

**Tech Stack:** PowerShell 7, Git, Node.js, npm, Vitest, Vite, Taro, WeChat CloudBase

**Spec:** `docs/superpowers/specs/2026-08-21-siyu-local-archive.md`

## Global Constraints

- Archive root is exactly `D:\AI思屿`.
- Keep `C:\Users\76518\Desktop\思屿.lnk` on the desktop and copy it into the archive.
- Never archive or commit `.env`, `.env.local`, `DATABASE_URL`, private access token values, `data`, `.vercel`, `exports`, or `output`.
- Exclude `node_modules`, `dist`, and `.swc` from current-source snapshots.
- Preserve existing user changes in `package-lock.json` and `assets/siyu-icon-v3.png` unless independently selected for this task.
- Do not move unrelated desktop projects such as `myownapp` or tool shortcuts.

---

### Task 1: Build the archive inventory and structure

**Files:**
- Create: `D:\AI思屿\00-文档\归档清单.md`
- Create directories under: `D:\AI思屿`

**Interfaces:**
- Consumes: the explicit source list from the spec.
- Produces: validated archive destinations used by every later task.

- [ ] **Step 1: Resolve and validate all source paths**

Run `Get-Item -LiteralPath` for every source in the spec and fail if a source resolves outside `C:\Users\76518\Desktop`.

- [ ] **Step 2: Create the archive layout**

Create `00-文档`, `01-当前源码`, `02-微信小程序历史包`, `03-网页历史上传包`, `04-设计资料`, `05-图标与快捷方式`, and `06-校验记录` below `D:\AI思屿`.

- [ ] **Step 3: Record the pre-move inventory**

Record source path, type, byte size, file count, and last modified time without recording any secret value.

### Task 2: Move desktop artifacts and create a safe current-source snapshot

**Files:**
- Move: `C:\Users\76518\Desktop\AI-discuss-and-thinking-upload-20260817-170657`
- Move: `C:\Users\76518\Desktop\思屿-AI对话与个人知识沉淀平台-产品设计文档.pdf`
- Move: `C:\Users\76518\Desktop\思屿日记-微信小程序-20260820-224550.zip`
- Move: `C:\Users\76518\Desktop\思屿日记-微信小程序-最终归档-20260820-224751.zip`
- Copy: `C:\Users\76518\Desktop\思屿.lnk`
- Create: `D:\AI思屿\01-当前源码\AI-discuss-and-thinking`

**Interfaces:**
- Consumes: validated destinations from Task 1.
- Produces: one local archive root with historical artifacts and a current safe snapshot.

- [ ] **Step 1: Move each explicit desktop artifact with literal paths**

Use one PowerShell process, verify each resolved destination remains below `D:\AI思屿`, then call `Move-Item -LiteralPath` for only the listed artifacts.

- [ ] **Step 2: Copy the desktop shortcut and icon assets**

Copy the shortcut and the archived original PNG/ICO into `05-图标与快捷方式`; do not remove the desktop shortcut.

- [ ] **Step 3: Create a tracked-source snapshot**

Export the verified Git tree to `01-当前源码\AI-discuss-and-thinking` so untracked secrets, `.git`, caches, and generated output are absent.

- [ ] **Step 4: Scan the archive for forbidden names**

Fail if the archive contains `.env`, `.env.local`, `data`, `.vercel`, `exports`, or `output`; allow `.env.example` because it contains placeholders only.

### Task 3: Verify web, miniapp, and cloud-function reliability

**Files:**
- Read: `package.json`
- Read: `miniapp/package.json`
- Read: `miniapp/src/api/cloud-transport.ts`
- Read: `miniapp/cloudfunctions/siyuApi/production.cjs`
- Read: `miniapp/tools/archive-safety.mjs`

**Interfaces:**
- Consumes: current working tree and production URL.
- Produces: test/build evidence and a reliability summary for documentation.

- [ ] **Step 1: Run the web verification suite**

Run `npm test` and `npm run build`; require exit code 0 and record the test count.

- [ ] **Step 2: Run the miniapp verification suite**

Run `npm test`, `npm run typecheck`, and `npm run build:weapp` from `miniapp`; require exit code 0.

- [ ] **Step 3: Run cloud-function tests**

Run `npm run test:cloud` from `miniapp`; require exit code 0.

- [ ] **Step 4: Validate production health and protected reads**

Read the token only into process memory from `.env.local`, call `/api/health`, `/api/models`, `/api/topics`, and `/api/weekly`, and print only status/record counts, never the token.

### Task 4: Write user and AI handoff documentation

**Files:**
- Create: `docs/使用指导.md`
- Create: `docs/AI接续说明.md`
- Copy both to: `D:\AI思屿\00-文档`

**Interfaces:**
- Consumes: verified URLs, project layout, test results, and archive layout.
- Produces: human instructions and a new-account AI handoff without secrets.

- [ ] **Step 1: Write the user guide**

Document website opening and login, desktop shortcut, WeChat Developer Tools import, CloudBase prerequisites, data synchronization, backup, and troubleshooting.

- [ ] **Step 2: Write the AI handoff**

Document repository/worktree/branch, production and preview URLs, Vercel/Neon/CloudBase architecture, verification commands, archive location, known constraints, and explicit secret-handling rules.

- [ ] **Step 3: Copy the verified documents into the local archive**

Copy the two Markdown files and this spec/plan into `D:\AI思屿\00-文档`.

### Task 5: Publish safe current source and documentation to Git

**Files:**
- Add: `docs/使用指导.md`
- Add: `docs/AI接续说明.md`
- Add: the spec and plan from this task
- Include: previously committed current web/miniapp source from `codex/vercel-neon-preview`

**Interfaces:**
- Consumes: passing verification and a clean sensitive-data scan.
- Produces: a fast-forward remote branch and an updated `main` deployment commit.

- [ ] **Step 1: Review the exact Git diff and sensitive paths**

Run `git diff --check`, inspect `git status --short`, and ensure `.env.local`, `.vercel`, exports, output, and generated archives are absent.

- [ ] **Step 2: Commit only task documentation on the feature branch**

Stage the four new documentation files explicitly and commit with `docs: archive Siyu usage and AI handoff`.

- [ ] **Step 3: Update the Git remote without overwriting remote history**

Fetch `siyu/main`, create a merge/fast-forward commit that preserves both remote deployment history and the verified feature-tree content, then push `main` and `codex/vercel-neon-preview` without force.

### Task 6: Final evidence and archive manifest

**Files:**
- Update: `D:\AI思屿\00-文档\归档清单.md`
- Create: `D:\AI思屿\06-校验记录\SHA256SUMS.txt`

**Interfaces:**
- Consumes: final archive and final Git commit.
- Produces: independently checkable completion evidence.

- [ ] **Step 1: Hash archived files**

Generate SHA-256 for all archived files except transient dependency caches and write relative paths to `SHA256SUMS.txt`.

- [ ] **Step 2: Re-run forbidden-path and secret scans**

Require zero forbidden paths and zero real secret matches in the archive and Git diff.

- [ ] **Step 3: Verify moved sources and retained shortcuts**

Confirm every moved desktop source is absent, every destination exists, and `C:\Users\76518\Desktop\思屿.lnk` still exists and points to the production site.

- [ ] **Step 4: Record final Git and deployment evidence**

Record commit IDs, branch names, production health, test counts, archive item counts, and any access caveats in the manifest.
