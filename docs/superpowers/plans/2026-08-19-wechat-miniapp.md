# 思屿微信小程序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, Android-ready WeChat mini program that mirrors Siyu's five core areas and shares the existing Vercel/Neon data.

**Architecture:** Add an isolated Taro 4.2.1 React/TypeScript app under `miniapp/`. It calls the existing HTTPS API through one typed client; a server middleware validates an optional private bearer token for all personal-data requests, while both website and mini program store the user-entered token only on their own device. Pages share focused UI primitives and use clipboard handoff for DeepSeek.

**Tech Stack:** Taro 4.2.1, React 18, TypeScript, Vitest, WeChat mini-program target, existing Node 22 Vercel API and Neon Postgres.

**Spec:** `docs/superpowers/specs/2026-08-19-wechat-miniapp-design.md`

## Global Constraints

- First release is for one user and uses a test AppID; a formal AppID replaces configuration later.
- Keep the existing Vite website deployable and backward compatible.
- Use the existing Vercel API and Neon database; the mini program never connects to Neon directly.
- Do not enable paid services or a custom domain.
- Never commit or print `DATABASE_URL`, `.env`, `.env.local`, `data`, `.vercel`, `exports`, `output`, or the private mini-program access token.
- DeepSeek remains a clipboard handoff; never read or store DeepSeek credentials, cookies, or login state.
- Taro packages are pinned to `4.2.1`; build with `npm run build:weapp` as documented by Taro.

---

### Task 1: Isolated Taro shell and safe configuration

**Files:**
- Create: `miniapp/package.json`
- Create: `miniapp/tsconfig.json`
- Create: `miniapp/babel.config.cjs`
- Create: `miniapp/config/index.ts`
- Create: `miniapp/project.config.json`
- Create: `miniapp/src/app.tsx`
- Create: `miniapp/src/app.config.ts`
- Create: `miniapp/src/app.scss`
- Create: `miniapp/src/config/runtime.ts`
- Create: `miniapp/src/config/runtime.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `getRuntimeConfig(): { apiBaseUrl: string }` and a Taro app whose output directory is `miniapp/dist`.

- [ ] **Step 1: Write the failing runtime configuration test**

```ts
import { describe, expect, test } from 'vitest'
import { getRuntimeConfig } from './runtime'

describe('getRuntimeConfig', () => {
  test('normalizes the HTTPS API base URL', () => {
    expect(getRuntimeConfig({ TARO_APP_API_BASE_URL: 'https://example.com/' }).apiBaseUrl)
      .toBe('https://example.com')
  })
  test('rejects a non-HTTPS production URL', () => {
    expect(() => getRuntimeConfig({ TARO_APP_API_BASE_URL: 'http://example.com' })).toThrow('必须使用 HTTPS')
  })
})
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `cd miniapp; npm test -- src/config/runtime.test.ts`
Expected: FAIL because `runtime.ts` does not exist.

- [ ] **Step 3: Add the pinned Taro project and minimal runtime implementation**

Use React/TypeScript dependencies pinned to Taro `4.2.1`, scripts `dev:weapp`, `build:weapp`, `test`, and `typecheck`. Implement:

```ts
type RuntimeEnv = Record<string, string | undefined>
export function getRuntimeConfig(env: RuntimeEnv = process.env) {
  const apiBaseUrl = (env.TARO_APP_API_BASE_URL || 'https://temporary-prompt-ridge-2fk9bxn.vercel.app').replace(/\/$/, '')
  if (!apiBaseUrl.startsWith('https://')) throw new Error('小程序接口必须使用 HTTPS')
  return { apiBaseUrl }
}
```

Set `appid` to `touristappid`, `miniprogramRoot` to `dist/`, and add `miniapp/.env*`, `miniapp/project.private.config.json`, and `miniapp/dist/` to `.gitignore`.

- [ ] **Step 4: Install independently and verify tests, types, and build**

Run: `cd miniapp; npm install; npm test; npm run typecheck; npm run build:weapp`
Expected: all commands exit 0 and `miniapp/dist/app.json` exists.

- [ ] **Step 5: Commit only the mini-program shell and ignore rules**

```bash
git add .gitignore miniapp
git commit -m "feat: scaffold private WeChat mini program"
```

### Task 2: Private API request authentication for website and mini program

**Files:**
- Create: `server/private-access.mjs`
- Create: `server/private-access.test.mjs`
- Modify: `server/http.mjs`
- Create: `src/features/access/AccessGate.tsx`
- Create: `src/features/access/AccessGate.test.tsx`
- Create: `src/lib/access-token.ts`
- Modify: `src/lib/backend-api.ts`
- Modify: `src/features/models/model-api.ts`
- Modify: `src/features/weekly/weekly-api.ts`
- Modify: `src/app/App.tsx`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: `authorizePrivateRequest(request, env): { ok: boolean; status?: number; message?: string }`, `getAccessToken()`, `setAccessToken(value)`, and a website unlock screen.
- Consumes: `SIYU_PRIVATE_ACCESS_TOKEN` from server environment and `Authorization: Bearer <token>` from website and mini-program requests.

- [ ] **Step 1: Write failing authorization tests**

```js
test('allows website requests when no private token is configured', () => {
  assert.equal(authorizePrivateRequest({ headers: {} }, {} ).ok, true)
})
test('rejects a wrong bearer token when protection is configured', () => {
  const result = authorizePrivateRequest({ headers: { authorization: 'Bearer wrong' } }, { SIYU_PRIVATE_ACCESS_TOKEN: 'right' })
  assert.equal(result.status, 401)
})
test('accepts the configured bearer token', () => {
  assert.equal(authorizePrivateRequest({ headers: { authorization: 'Bearer right' } }, { SIYU_PRIVATE_ACCESS_TOKEN: 'right' }).ok, true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test server/private-access.test.mjs`
Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement constant-time token comparison and API guard**

Use `timingSafeEqual` on equal-length buffers. Apply the guard after `/api/health` and before every other API route only when `SIYU_PRIVATE_ACCESS_TOKEN` is configured. Return `{ error: '私人访问验证失败', code: 'UNAUTHORIZED' }` with status 401. Make every website API helper add the locally stored bearer token. `AccessGate` asks for the token, verifies it against `/api/models`, and stores it in `localStorage` only after success. Document configuration without inserting a value.

- [ ] **Step 4: Verify focused and full server tests**

Run: `node --test server/private-access.test.mjs server/api.test.mjs; npm test -- src/features/access/AccessGate.test.tsx; npm run typecheck`
Expected: PASS, including existing website requests when the token is absent in test environments and unlock/retry behavior when it is configured.

- [ ] **Step 5: Commit the API protection**

```bash
git add server/private-access.mjs server/private-access.test.mjs server/http.mjs src/features/access src/lib/access-token.ts src/lib/backend-api.ts src/features/models/model-api.ts src/features/weekly/weekly-api.ts src/app/App.tsx .env.example README.md
git commit -m "feat: protect private mini program API access"
```

### Task 3: Typed mini-program API client

**Files:**
- Create: `miniapp/src/api/types.ts`
- Create: `miniapp/src/api/client.ts`
- Create: `miniapp/src/api/client.test.ts`

**Interfaces:**
- Produces: `apiRequest<T>(path, init?)`, `fetchTopics()`, `ensureDailyTopics()`, `createTopic(input)`, `fetchWorkspace(topicId)`, `updateWorkspace(topicId, patch)`, `addMessage(topicId, input)`, `fetchWeekly()`, `refreshWeekly()`, and `saveWeeklyAnalysis(input)`.
- Consumes: `getRuntimeConfig()` from Task 1, a token read at runtime from `Taro.getStorageSync('siyu-access-token')`, and `Taro.request`.

- [ ] **Step 1: Write failing client tests with an injected request function**

```ts
test('adds base URL, JSON content type, and bearer token', async () => {
  const request = vi.fn().mockResolvedValue({ statusCode: 200, data: { topics: [] } })
  await createApiClient({ apiBaseUrl: 'https://example.com', getAccessToken: () => 'secret' }, request).fetchTopics()
  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    url: 'https://example.com/api/topics',
    header: expect.objectContaining({ Authorization: 'Bearer secret' })
  }))
})
test('returns a Chinese error for a failed request', async () => {
  const request = vi.fn().mockResolvedValue({ statusCode: 503, data: { error: '服务暂时不可用' } })
  await expect(createApiClient(config, request).fetchTopics()).rejects.toThrow('服务暂时不可用')
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `cd miniapp; npm test -- src/api/client.test.ts`
Expected: FAIL because `createApiClient` is missing.

- [ ] **Step 3: Implement the typed client**

Define API types matching the existing website types. Build every URL from the configured HTTPS origin, encode topic IDs, send JSON bodies, read the token at request time, omit the authorization header when it is empty, and translate status 401 to `私人访问已失效，请重新配置`. Add a first-launch unlock view that verifies `/api/models` before saving the entered token with `Taro.setStorageSync`.

- [ ] **Step 4: Verify client tests and types**

Run: `cd miniapp; npm test -- src/api/client.test.ts; npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit the client**

```bash
git add miniapp/src/api
git commit -m "feat: add typed mini program API client"
```

### Task 4: Shared mobile UI and navigation

**Files:**
- Create: `miniapp/src/components/PageState.tsx`
- Create: `miniapp/src/components/PageState.scss`
- Create: `miniapp/src/components/TopicCard.tsx`
- Create: `miniapp/src/components/TopicCard.scss`
- Create: `miniapp/src/components/components.test.tsx`
- Create: `miniapp/src/pages/today/index.tsx`
- Create: `miniapp/src/pages/today/index.config.ts`
- Create: `miniapp/src/pages/today/index.scss`
- Modify: `miniapp/src/app.config.ts`

**Interfaces:**
- Produces: `PageState({ loading, error, empty, onRetry, children })` and `TopicCard({ topic, onOpen })`.
- Consumes: the topic API from Task 3.

- [ ] **Step 1: Write failing component tests**

```tsx
test('shows a retry action without losing the Chinese error', () => {
  render(<PageState error="网络连接失败" onRetry={retry}><View>内容</View></PageState>)
  expect(screen.getByText('网络连接失败')).toBeTruthy()
  fireEvent.click(screen.getByText('重新加载'))
  expect(retry).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd miniapp; npm test -- src/components/components.test.tsx`
Expected: FAIL because shared components are missing.

- [ ] **Step 3: Implement shared components and Today page**

Load `ensureDailyTopics()` and `fetchTopics()` together, deduplicate by ID, render the real Chinese date and the first three daily topics, and add a creation form. Configure five tab-bar entries: 今日、思考、周报、知识库、回顾. Use only Taro components (`View`, `Text`, `Button`, `Input`, `ScrollView`).

- [ ] **Step 4: Verify tests, types, and WeChat build**

Run: `cd miniapp; npm test; npm run typecheck; npm run build:weapp`
Expected: PASS and tab-bar entries appear in `dist/app.json`.

- [ ] **Step 5: Commit the mobile shell**

```bash
git add miniapp/src/components miniapp/src/pages/today miniapp/src/app.config.ts miniapp/src/app.scss
git commit -m "feat: add Siyu mobile navigation and today page"
```

### Task 5: Thinking spaces, workspace persistence, and DeepSeek handoff

**Files:**
- Create: `miniapp/src/features/handoff.ts`
- Create: `miniapp/src/features/handoff.test.ts`
- Create: `miniapp/src/pages/spaces/index.tsx`
- Create: `miniapp/src/pages/spaces/index.config.ts`
- Create: `miniapp/src/pages/spaces/index.scss`
- Create: `miniapp/src/pages/workspace/index.tsx`
- Create: `miniapp/src/pages/workspace/index.config.ts`
- Create: `miniapp/src/pages/workspace/index.scss`
- Modify: `miniapp/src/app.config.ts`

**Interfaces:**
- Produces: `buildDeepSeekPrompt(topicTitle, messages, input): string` and `validateImportedAnswer(value): { ok: true; value: string } | { ok: false; error: string }`.
- Consumes: topic/workspace/message APIs from Task 3 and `Taro.setClipboardData` / `Taro.getClipboardData`.

- [ ] **Step 1: Write failing handoff tests**

```ts
test('builds a Chinese prompt containing the topic and new thought', () => {
  expect(buildDeepSeekPrompt('技术会让人更自由吗？', [], '先区分选择与控制')).toContain('先区分选择与控制')
})
test('rejects an empty imported answer', () => {
  expect(validateImportedAnswer('  ')).toEqual({ ok: false, error: '请先粘贴 DeepSeek 的回答' })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd miniapp; npm test -- src/features/handoff.test.ts`
Expected: FAIL because the functions are missing.

- [ ] **Step 3: Implement pages and persistence**

Spaces lists topics and navigates with `Taro.navigateTo({ url: '/pages/workspace/index?id=' + encodeURIComponent(id) })`. Workspace loads the workspace and messages, debounces field saves, keeps unsaved input on errors, copies a DeepSeek prompt, reads clipboard on return only after an explicit button tap, previews editable text, and saves it as an assistant message.

- [ ] **Step 4: Verify persistence behavior with tests and build**

Add page tests that assert a failed save keeps textarea content and a successful import calls `addMessage` with role `assistant`. Run: `cd miniapp; npm test; npm run typecheck; npm run build:weapp`.
Expected: PASS.

- [ ] **Step 5: Commit thinking spaces**

```bash
git add miniapp/src/features miniapp/src/pages/spaces miniapp/src/pages/workspace miniapp/src/app.config.ts
git commit -m "feat: add persistent mini program thinking spaces"
```

### Task 6: AI weekly page with Chinese translations

**Files:**
- Create: `miniapp/src/features/weekly.ts`
- Create: `miniapp/src/features/weekly.test.ts`
- Create: `miniapp/src/pages/weekly/index.tsx`
- Create: `miniapp/src/pages/weekly/index.config.ts`
- Create: `miniapp/src/pages/weekly/index.scss`

**Interfaces:**
- Produces: `parseSavedTranslations(analyses): Map<string, { title: string; summary: string }>` and `buildWeeklyTranslationPrompt(items): string`.
- Consumes: weekly APIs from Task 3 and translation analysis ID `weekly-translation`.

- [ ] **Step 1: Write failing translation tests**

```ts
test('uses saved Chinese translations by item ID', () => {
  const map = parseSavedTranslations([{ analystId: 'weekly-translation', fingerprint: 'x', markdown: '[{"id":"a","title":"中文标题","summary":"中文摘要"}]', updatedAt: '' }])
  expect(map.get('a')?.title).toBe('中文标题')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd miniapp; npm test -- src/features/weekly.test.ts`
Expected: FAIL because parsing is missing.

- [ ] **Step 3: Implement weekly browsing, refresh, and handoff import**

Show Chinese title and summary first, original English below, source and date, partial-source warnings, refresh status, and empty state. Translation import must validate that every current item ID appears exactly once before calling `saveWeeklyAnalysis({ analystId: 'weekly-translation', ... })`.

- [ ] **Step 4: Verify weekly behavior and build**

Run: `cd miniapp; npm test; npm run typecheck; npm run build:weapp`
Expected: PASS.

- [ ] **Step 5: Commit weekly support**

```bash
git add miniapp/src/features/weekly.ts miniapp/src/features/weekly.test.ts miniapp/src/pages/weekly
git commit -m "feat: add Chinese AI weekly mini program page"
```

### Task 7: Knowledge library and review pages

**Files:**
- Create: `miniapp/src/features/library.ts`
- Create: `miniapp/src/features/library.test.ts`
- Create: `miniapp/src/pages/library/index.tsx`
- Create: `miniapp/src/pages/library/index.config.ts`
- Create: `miniapp/src/pages/library/index.scss`
- Create: `miniapp/src/pages/review/index.tsx`
- Create: `miniapp/src/pages/review/index.config.ts`
- Create: `miniapp/src/pages/review/index.scss`

**Interfaces:**
- Produces: `buildLibraryEntries(topics, workspaces): LibraryEntry[]` and `groupReviewEntries(entries): ReviewGroup[]`.
- Consumes: topic and workspace APIs from Task 3.

- [ ] **Step 1: Write failing transformation tests**

```ts
test('turns non-empty workspace fields into searchable entries', () => {
  const entries = buildLibraryEntries([topic], [{ ...workspace, summary: '总结', reflection: '感思' }])
  expect(entries.map(item => item.kind)).toEqual(expect.arrayContaining(['纪要', '感思']))
})
test('sorts review groups newest first', () => {
  expect(groupReviewEntries(entries)[0].date >= groupReviewEntries(entries)[1].date).toBe(true)
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd miniapp; npm test -- src/features/library.test.ts`
Expected: FAIL because transformation functions are missing.

- [ ] **Step 3: Implement searchable library and chronological review**

Fetch topics, then their workspaces with a concurrency limit of four. Library filters title/content locally; Review groups entries by Chinese calendar date. Both pages use `PageState` for loading, empty, and retry states and navigate back to the relevant workspace.

- [ ] **Step 4: Verify feature tests and build**

Run: `cd miniapp; npm test; npm run typecheck; npm run build:weapp`
Expected: PASS.

- [ ] **Step 5: Commit library and review**

```bash
git add miniapp/src/features/library.ts miniapp/src/features/library.test.ts miniapp/src/pages/library miniapp/src/pages/review
git commit -m "feat: add mini program library and review"
```

### Task 8: Security audit, Android preview handoff, and deployment synchronization

**Files:**
- Create: `miniapp/README.md`
- Create: `docs/verification/2026-08-19-wechat-miniapp.md`
- Modify: `README.md`
- Modify: `.vercelignore`

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: reproducible build/open instructions and verification evidence without secrets.

- [ ] **Step 1: Add a repository safety test**

Create `miniapp/src/config/repository-safety.test.ts` that walks tracked miniapp source/config files and fails if it finds database URL schemes, `DATABASE_URL=`, `SIYU_PRIVATE_ACCESS_TOKEN=` with a non-empty value, or a hard-coded bearer token.

- [ ] **Step 2: Run the safety test and verify its fixture catches a secret**

Run: `cd miniapp; npm test -- src/config/repository-safety.test.ts`
Expected: PASS for repository files; its inline unsafe sample is reported as unsafe.

- [ ] **Step 3: Document local setup and finish ignore coverage**

Document: install dependencies, create an untracked local env file, run `npm run dev:weapp`, import `miniapp` into WeChat Developer Tools using the test AppID, disable ES6-to-ES5/style auto-completion/upload compression per current Taro guidance, and preview on Android. Add `miniapp/` exceptions only as needed while ensuring `miniapp/dist`, local env, and private project config are excluded from Git and Vercel uploads.

- [ ] **Step 4: Run the complete verification suite**

Run:

```powershell
npm test
npm run typecheck
npm run build
Set-Location miniapp
npm test
npm run typecheck
npm run build:weapp
Set-Location ..
git ls-files | rg '(^|/)(\.env|\.env\.local|data|\.vercel|exports|output)(/|$)'
git grep -n -E 'postgres(ql)?://|DATABASE_URL=.+|SIYU_PRIVATE_ACCESS_TOKEN=.+' -- ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/*'
```

Expected: all test/type/build commands pass; both safety searches return no sensitive tracked content. Verify production `/api/health`, topics, workspace persistence, weekly Chinese content, and mobile layout without displaying credentials.

- [ ] **Step 5: Commit verification documentation**

```bash
git add miniapp/README.md README.md .vercelignore docs/verification/2026-08-19-wechat-miniapp.md miniapp/src/config/repository-safety.test.ts
git commit -m "docs: verify WeChat mini program preview"
```

- [ ] **Step 6: Push and deploy after local verification**

Push the implementation branch to the authorized GitHub repository, confirm Vercel deploys the shared API, and set `SIYU_PRIVATE_ACCESS_TOKEN` as a Sensitive value for Production and Preview without printing it. Open the website once to enter the same private token locally, re-run health and persistence checks, then provide the user with the WeChat Developer Tools import path and Android preview steps.
