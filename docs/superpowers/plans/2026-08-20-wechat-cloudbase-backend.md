# 思屿微信云开发后端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mini program's unreachable Vercel transport with an owner-locked WeChat CloudBase function and database so the Android preview is usable without paid infrastructure.

**Architecture:** Keep the existing page-facing API methods, but implement them on top of `Taro.cloud.callFunction({ name: 'siyuApi' })`. A tested cloud-function core dispatches actions to a CloudBase repository backed by one `siyu_state` collection; the first caller OPENID becomes the sole owner. Existing Vercel/Neon website code remains unchanged.

**Tech Stack:** Taro 4.2.1, React 18, TypeScript, Vitest, WeChat CloudBase, `wx-server-sdk`, Node.js cloud functions.

**Spec:** `docs/superpowers/specs/2026-08-20-wechat-cloudbase-backend.md`

## Global Constraints

- Use AppID `wxb652ab7130eb1b4a` and a free CloudBase experience environment only.
- Do not enable pay-as-you-go, buy a plan, or add a custom domain.
- Never print or commit OPENID, cloud tickets, `.env`, `.env.local`, `DATABASE_URL`, `data`, `.vercel`, `exports`, or `output`.
- The mini program must not call Vercel after migration; the website continues using Vercel and Neon.
- The first successful caller becomes the only CloudBase data owner.
- Daily topics use the bundled Chinese topic bank and do not call a paid AI API.
- DeepSeek remains an explicit clipboard handoff.

---

### Task 1: Cloud action contract and deterministic daily topics

**Files:**
- Create: `miniapp/cloudfunctions/siyuApi/core.cjs`
- Create: `miniapp/cloudfunctions/siyuApi/core.test.cjs`
- Create: `miniapp/cloudfunctions/siyuApi/daily-topics.cjs`
- Create: `miniapp/cloudfunctions/siyuApi/package.json`
- Modify: `miniapp/package.json`

**Interfaces:**
- Produces: `createSiyuService({ repository, now, randomId }).execute(action, payload)`.
- Produces: `dailyTopicDrafts(date): Topic[]` using Asia/Shanghai date keys.
- Repository methods consumed by the core: `ensureOwner(openid)`, `listTopics()`, `getTopic(id)`, `putTopic(topic)`, `getWorkspace(topicId)`, `putWorkspace(workspace)`, `getWeekly()`, and `putWeekly(snapshot)`.

- [ ] **Step 1: Write a failing owner and persistence test**

```js
test('creates a topic and returns it after a new service instance', async () => {
  const repository = createMemoryRepository()
  const first = createSiyuService({ repository, now: fixedNow, randomId: () => 'topic-1' })
  await first.execute('createTopic', { title: '新的思考' })
  const second = createSiyuService({ repository, now: fixedNow, randomId: () => 'unused' })
  assert.deepEqual((await second.execute('fetchTopics')).map(item => item.id), ['topic-1'])
})
```

- [ ] **Step 2: Run the cloud core test and verify RED**

Run: `cd miniapp; node --test cloudfunctions/siyuApi/core.test.cjs`
Expected: FAIL because `createSiyuService` is not defined.

- [ ] **Step 3: Implement the minimal action service**

Implement exact actions `health`, `fetchTopics`, `ensureDailyTopics`, `createTopic`, `fetchWorkspace`, `updateWorkspace`, `addMessage`, `fetchWeekly`, `refreshWeekly`, and `saveWeeklyAnalysis`. Use existing `Topic`, `WorkspaceData`, and `WeeklySnapshot` field names. Reject blank titles, missing topics, unsupported workspace fields, invalid message roles, and empty analysis content with Chinese errors.

- [ ] **Step 4: Add and verify deterministic daily-topic tests**

Assert that one Shanghai calendar day yields exactly three stable IDs and that the following day yields different IDs. Run the focused test again and expect PASS.

- [ ] **Step 5: Expose a cloud test script and commit**

Add `"test:cloud": "node --test cloudfunctions/siyuApi/*.test.cjs"` to `miniapp/package.json`. Run `npm run test:cloud` and commit only Task 1 files with message `feat: add CloudBase action core`.

### Task 2: CloudBase repository, owner lock, and official weekly refresh

**Files:**
- Create: `miniapp/cloudfunctions/siyuApi/repository.cjs`
- Create: `miniapp/cloudfunctions/siyuApi/repository.test.cjs`
- Create: `miniapp/cloudfunctions/siyuApi/weekly-sources.cjs`
- Create: `miniapp/cloudfunctions/siyuApi/weekly-sources.test.cjs`
- Create: `miniapp/cloudfunctions/siyuApi/index.js`
- Create: `miniapp/cloudfunctions/siyuApi/config.json`
- Modify: `miniapp/cloudfunctions/siyuApi/package.json`
- Modify: `miniapp/project.config.json`

**Interfaces:**
- Produces: `createCloudRepository(db)` implementing the Task 1 repository contract in collection `siyu_state`.
- Produces: `main(event)` returning `{ ok: true, data }` or `{ ok: false, error, code }`.
- Consumes: `cloud.getWXContext().OPENID`; empty OPENID is rejected.

- [ ] **Step 1: Write a failing owner-lock repository test**

Use a small in-memory CloudBase database double that mirrors `collection().doc().get/set()` and `where().get()`. Assert that `ensureOwner('first')` creates the owner, repeated calls by `first` succeed, and `ensureOwner('second')` rejects with `此微信账号无权访问思屿`.

- [ ] **Step 2: Run the repository test and verify RED**

Run: `cd miniapp; node --test cloudfunctions/siyuApi/repository.test.cjs`
Expected: FAIL because `createCloudRepository` is missing.

- [ ] **Step 3: Implement CloudBase document storage**

Use document IDs `owner`, `topic-<id>`, `workspace-<topicId>`, and `weekly`. Store a `type` discriminator. Create the owner with fixed `_id: 'owner'`; on an add race, read the winner and enforce it. Keep messages inside the workspace document and sort topics/messages by `updatedAt`/`createdAt` before returning them.

- [ ] **Step 4: Port and test official weekly-source normalization**

Port the allowlisted sources and seven-day filtering from `server/weekly-sources.mjs`. Keep HTTPS host allowlists, response-size limits, a 10-second abort, URL canonicalization, and per-source errors. Test RSS parsing and redirect rejection with literal fixtures.

- [ ] **Step 5: Implement the cloud entry point and project configuration**

Initialize `wx-server-sdk` with `cloud.DYNAMIC_CURRENT_ENV`. Call `repository.ensureOwner(OPENID)` before every action. Configure a 20-second function timeout and add `"cloudfunctionRoot": "cloudfunctions/"` to `project.config.json`. Add `wx-server-sdk` as the only production dependency.

- [ ] **Step 6: Run cloud tests and commit**

Run `npm run test:cloud`; expect all cloud tests PASS. Commit Task 2 files with message `feat: persist Siyu in WeChat CloudBase`.

### Task 3: Switch the Taro client from HTTP to CloudBase

**Files:**
- Create: `miniapp/src/api/cloud-transport.ts`
- Create: `miniapp/src/api/cloud-transport.test.ts`
- Modify: `miniapp/src/api/client-core.ts`
- Modify: `miniapp/src/api/client.test.ts`
- Modify: `miniapp/src/api/client.ts`
- Modify: `miniapp/src/config/runtime.ts`
- Modify: `miniapp/src/config/runtime.test.ts`
- Modify: `miniapp/src/app.tsx`
- Modify: `miniapp/src/components/DeviceAccessGate.tsx`
- Modify: `miniapp/src/features/device-access.ts`
- Modify: `miniapp/src/features/device-access.test.ts`

**Interfaces:**
- Produces: `createCloudTransport(callFunction)` whose `call<T>(action, payload?)` unwraps the cloud response.
- `getRuntimeConfig()` produces `{ cloudEnvId: string }` and rejects an empty value.
- Page-facing `api` keeps its existing methods and return types.

- [ ] **Step 1: Write a failing transport contract test**

```ts
test('unwraps a successful CloudBase action', async () => {
  const transport = createCloudTransport(async () => ({ result: { ok: true, data: { topics: [] } } }))
  await expect(transport.call('fetchTopics')).resolves.toEqual({ topics: [] })
})
test('turns a rejected owner into a Chinese error', async () => {
  const transport = createCloudTransport(async () => ({ result: { ok: false, error: '此微信账号无权访问思屿' } }))
  await expect(transport.call('health')).rejects.toThrow('此微信账号无权访问思屿')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd miniapp; npm test -- src/api/cloud-transport.test.ts`
Expected: FAIL because `createCloudTransport` is missing.

- [ ] **Step 3: Implement the cloud transport and API mapping**

Call `Taro.cloud.callFunction({ name: 'siyuApi', data: { action, payload } })`. Map every existing API method to its named cloud action. Initialize cloud once in `app.tsx` with `Taro.cloud.init({ env: cloudEnvId, traceUser: true })` before pages load.

- [ ] **Step 4: Replace the private-token gate with cloud health**

Remove token input, bearer verification, and local token storage. `DeviceAccessGate` calls `api.health()` and opens on success; on failure it shows the Chinese cloud error and retry button. Update tests so a missing HTTP origin or token can no longer break startup.

- [ ] **Step 5: Verify mini-program behavior and commit**

Run `npm test`, `npm run typecheck`, `npm run build:weapp`, and `npm run test:cloud`. Expect all PASS. Commit Task 3 files with message `feat: use WeChat cloud backend in mini program`.

### Task 4: Free environment provisioning, deployment, and Android verification

**Files:**
- Modify: `miniapp/src/config/runtime.ts` with the created public environment ID.
- Modify: `miniapp/README.md`
- Create: `docs/verification/2026-08-20-wechat-cloudbase.md`

**Interfaces:**
- Consumes: the authorized WeChat public-platform session and WeChat Developer Tools CLI.
- Produces: a deployed `siyuApi` function, `siyu_state` collection, and a scannable Android preview QR.

- [ ] **Step 1: Create or select the free CloudBase environment**

In the authorized WeChat/CloudBase console, choose the free experience environment only. Stop before any screen that enables pay-as-you-go or requests payment. Record only the non-secret environment ID in runtime configuration.

- [ ] **Step 2: Create the collection and deploy the function**

Create collection `siyu_state` with permissions denying direct client reads/writes; all access goes through the cloud function. Deploy `siyuApi` from `miniapp/cloudfunctions/siyuApi` with cloud dependency installation.

- [ ] **Step 3: Run local and simulator verification**

Run the full miniapp test/type/build suite, open the compiled project in WeChat Developer Tools, and verify the current page renders without process errors or exceptions. Call cloud `health` through the simulator and verify `{ ok: true }` without printing OPENID.

- [ ] **Step 4: Generate and verify Android preview**

Generate a new image QR with the WeChat CLI. On Android, verify: Today opens in under 12 seconds; create a uniquely named topic; close and reopen; confirm the topic persists; save a note and a message; open Weekly, Library, and Review; confirm no horizontal overflow or raw English system errors.

- [ ] **Step 5: Security and completion audit**

Run tracked-file scans for connection strings, tokens, OPENID values, and forbidden directories. Confirm no paid CloudBase switch was enabled. Save non-secret evidence in `docs/verification/2026-08-20-wechat-cloudbase.md`.

- [ ] **Step 6: Commit and upload safe source changes**

Commit only the migration and verification files with message `docs: verify WeChat CloudBase preview`. Upload to the authorized GitHub repository without `.env`, local project state, build output, cloud tickets, or owner identifiers.

