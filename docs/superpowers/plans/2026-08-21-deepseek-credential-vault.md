# DeepSeek Credential Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the owner to test, encrypt, save, use, disable, and replace a DeepSeek API Key from the Siyu website without manually editing Vercel settings.

**Architecture:** Add a server-only credential vault backed by the existing SQLite/Postgres store contract. A dedicated 32-byte Vercel Sensitive master key derives the DeepSeek AES-256-GCM key; the HTTP layer exposes authenticated configuration routes, while the existing stable `deepseek-chat` gateway resolves either a valid vault record or the legacy environment configuration. The React settings panel never receives a saved Key and only displays a safe credential status.

**Tech Stack:** Node.js 22 ESM, Node `crypto`, Vercel Functions, Neon Postgres, Node SQLite, React 19, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-deepseek-credential-vault-design.md`

## Global Constraints

- Only DeepSeek website API configuration is in scope; mini-program native chat remains out of scope.
- Keep the public Siyu gateway model ID exactly `deepseek-chat`; store the upstream value as `providerModelId`.
- Use a dedicated base64url `SIYU_CREDENTIAL_MASTER_KEY` that decodes to exactly 32 bytes; never derive encryption from `SIYU_PRIVATE_ACCESS_TOKEN`.
- All `/api/model-configs/*` routes fail closed unless a non-empty private access token is configured and correctly presented.
- Vault calls use the fixed `https://api.deepseek.com` origin and reject redirects.
- Never commit, print, log, screenshot, export, or archive a real API Key, master key, `DATABASE_URL`, `.env`, `.env.local`, `data`, `.vercel`, `exports`, or `output`.
- Backup/restore must not include `model_credentials`, even encrypted.
- A missing table or broken vault must not lock the access gate or unrelated website features.
- Preview must not persist or disable a real credential while it shares Production's Neon database.
- Preserve the unrelated untracked file `assets/siyu-icon-v3.png`.

## File Structure

- `server/model-credential-crypto.mjs`: master-key validation, HKDF derivation, AES-GCM serialization, authenticated decryption.
- `server/deepseek-client.mjs`: bounded DeepSeek `/models` request and sanitized provider errors.
- `server/model-credential-service.mjs`: safe status contract, vault/environment resolver, save/test/disable orchestration.
- `server/models.mjs`: stable model registry and chat transport using an optional resolved DeepSeek runtime.
- `server/database.mjs`: local SQLite credential record methods and local table initialization.
- `server/postgres-store.mjs`: Neon credential record methods.
- `server/migrations/2026-08-21-model-credentials.sql`: additive, idempotent production migration.
- `server/schema.sql`: full schema for new installations.
- `server/http.mjs`: fail-closed credential authorization and four configuration endpoints.
- `src/features/models/model-config-api.ts`: browser-safe configuration API types and requests.
- `src/features/models/ModelSettings.tsx`: DeepSeek configuration interaction and secret-state lifecycle.
- `src/app/App.tsx`: model refresh after save/disable.
- `src/styles/global.css`: responsive configuration form states.
- `README.md`, `docs/使用指导.md`, `docs/AI接续说明.md`: operator and owner guidance without secret values.

---

### Task 1: Credential cryptography boundary

**Files:**
- Create: `server/model-credential-crypto.mjs`
- Create: `server/model-credential-crypto.test.mjs`

**Interfaces:**
- Produces: `encryptModelCredential({ provider, apiKey, providerModelId, masterKey }) -> { provider, status, ciphertext, iv, authTag, keyVersion, providerModelId }`.
- Produces: `decryptModelCredential(record, masterKey) -> { apiKey, providerModelId }`.
- Produces: `CredentialKeyError` for missing/malformed roots and `CredentialDecryptError` for any invalid record without leaking the underlying cause.

- [ ] **Step 1: Write failing tests for valid round-trip and random IVs.**

```js
import { describe, expect, test } from 'vitest'
import { randomBytes } from 'node:crypto'
import { decryptModelCredential, encryptModelCredential } from './model-credential-crypto.mjs'

const masterKey = randomBytes(32).toString('base64url')

test('round-trips a DeepSeek key without storing plaintext', () => {
  const record = encryptModelCredential({ provider: 'deepseek', apiKey: 'synthetic-key', providerModelId: 'deepseek-v4-flash', masterKey })
  expect(JSON.stringify(record)).not.toContain('synthetic-key')
  expect(decryptModelCredential(record, masterKey)).toEqual({ apiKey: 'synthetic-key', providerModelId: 'deepseek-v4-flash' })
})

test('uses a fresh 12-byte IV for every save', () => {
  const input = { provider: 'deepseek', apiKey: 'synthetic-key', providerModelId: 'deepseek-v4-flash', masterKey }
  expect(encryptModelCredential(input).iv).not.toBe(encryptModelCredential(input).iv)
})
```

- [ ] **Step 2: Run the focused tests and verify they fail because the module does not exist.**

Run: `npx vitest run server/model-credential-crypto.test.mjs`

Expected: FAIL with module resolution error.

- [ ] **Step 3: Implement master-key decoding, HKDF, stable AAD, and AES-256-GCM.**

```js
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export class CredentialKeyError extends Error {}
export class CredentialDecryptError extends Error {}

const VERSION = 1
const aadFor = ({ provider, status, keyVersion, providerModelId }) =>
  Buffer.from(JSON.stringify([provider, status, keyVersion, providerModelId]), 'utf8')

function derive(masterKey, provider) {
  try {
    const encoded = String(masterKey || '')
    const root = Buffer.from(encoded, 'base64url')
    if (root.length !== 32 || root.toString('base64url') !== encoded) throw new Error('invalid root')
    return Buffer.from(hkdfSync('sha256', root, Buffer.from('siyu-model-credential-v1'), Buffer.from(`provider:${provider}`), 32))
  } catch {
    throw new CredentialKeyError('凭据加密服务未正确配置')
  }
}

export function encryptModelCredential({ provider, apiKey, providerModelId, masterKey }) {
  if (provider !== 'deepseek') throw new CredentialKeyError('不支持的凭据供应商')
  const iv = randomBytes(12)
  const meta = { provider, status: 'ready', keyVersion: VERSION, providerModelId }
  const cipher = createCipheriv('aes-256-gcm', derive(masterKey, provider), iv)
  cipher.setAAD(aadFor(meta))
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  return { ...meta, ciphertext: ciphertext.toString('base64url'), iv: iv.toString('base64url'), authTag: cipher.getAuthTag().toString('base64url') }
}
```

Add authenticated decryption with one sanitized failure path:

```js
export function decryptModelCredential(record, masterKey) {
  try {
    if (record.provider !== 'deepseek' || record.status !== 'ready' || record.keyVersion !== VERSION) throw new Error('unsupported record')
    const iv = Buffer.from(record.iv, 'base64url')
    const authTag = Buffer.from(record.authTag, 'base64url')
    if (iv.length !== 12 || authTag.length !== 16) throw new Error('invalid envelope')
    const decipher = createDecipheriv('aes-256-gcm', derive(masterKey, record.provider), iv)
    decipher.setAAD(aadFor(record))
    decipher.setAuthTag(authTag)
    const apiKey = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
    if (!apiKey) throw new Error('empty key')
    return { apiKey, providerModelId: record.providerModelId }
  } catch (error) {
    if (error instanceof CredentialKeyError) throw error
    throw new CredentialDecryptError('凭据需要重新填写')
  }
}
```

- [ ] **Step 4: Add failing tamper and malformed-root tests, then make them pass.**

Cover changes to `ciphertext`, `providerModelId`, `keyVersion`, IV length, tag length, missing root, a 31-byte root, and an unsupported provider. Assert error messages never contain the synthetic Key or raw crypto exception text.

Run: `npx vitest run server/model-credential-crypto.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the isolated cryptography unit.**

```text
git add server/model-credential-crypto.mjs server/model-credential-crypto.test.mjs
git commit -m "feat: add model credential encryption"
```

### Task 2: DeepSeek connection adapter

**Files:**
- Create: `server/deepseek-client.mjs`
- Create: `server/deepseek-client.test.mjs`

**Interfaces:**
- Consumes: a plaintext Key only as the `apiKey` call argument.
- Produces: `listDeepSeekModels({ apiKey, fetcher, timeoutMs }) -> Promise<string[]>`.
- Produces: `DeepSeekProviderError` with stable `code`, `status`, and sanitized Chinese `message`.

- [ ] **Step 1: Write failing adapter tests.**

```js
test('returns only bounded unique model ids', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
    { id: 'deepseek-v4-flash', object: 'model' },
    { id: 'deepseek-v4-flash', object: 'model' },
    { id: 'deepseek-v4-pro', object: 'model' },
  ] }), { status: 200 }))
  await expect(listDeepSeekModels({ apiKey: 'synthetic', fetcher })).resolves.toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
  expect(fetcher).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.objectContaining({ redirect: 'error' }))
})
```

Add table tests for 401/403, 402, 429, 500/503, timeout, a redirect, invalid JSON, an oversized body, more than 100 models, and IDs outside `1..128` characters. Assert raw upstream bodies and the Key are absent from thrown messages.

- [ ] **Step 2: Run the focused tests and observe the missing-module failure.**

Run: `npx vitest run server/deepseek-client.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement the bounded request.**

Use `AbortController`, `redirect: 'error'`, `Authorization: Bearer ...`, a default 8-second timeout, and a streaming/body-size cap of 256 KiB. Accept only a JSON object with `data` as an array and string `id` values; trim, deduplicate, sort in provider order, and cap at 100 IDs. Map provider errors to:

```js
const errorMap = {
  401: ['PROVIDER_AUTH_INVALID', 400, 'API Key 无效或无权限'],
  403: ['PROVIDER_AUTH_INVALID', 400, 'API Key 无效或无权限'],
  402: ['PROVIDER_BALANCE_INSUFFICIENT', 400, 'DeepSeek 账户余额不足'],
  429: ['PROVIDER_RATE_LIMITED', 429, 'DeepSeek 请求过于频繁，请稍后再试'],
}
```

All other upstream failures become `PROVIDER_UNAVAILABLE`; aborts become `PROVIDER_TIMEOUT`.

- [ ] **Step 4: Run focused tests.**

Run: `npx vitest run server/deepseek-client.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the adapter.**

```text
git add server/deepseek-client.mjs server/deepseek-client.test.mjs
git commit -m "feat: add bounded DeepSeek model probe"
```

### Task 3: SQLite/Postgres credential persistence and migration

**Files:**
- Create: `server/migrations/2026-08-21-model-credentials.sql`
- Modify: `server/schema.sql`
- Modify: `server/database.mjs`
- Modify: `server/database.test.mjs`
- Modify: `server/postgres-store.mjs`
- Modify: `server/postgres-store.test.mjs`

**Interfaces:**
- Produces on both stores: `getModelCredential(provider) -> record | null`.
- Produces on both stores: `saveModelCredential(record) -> stored record` using an atomic upsert.
- Produces on both stores: `disableModelCredential(provider, updatedAt?) -> disabled record` that clears ciphertext fields.
- Records use camelCase at the service boundary and snake_case only in SQL rows.

- [ ] **Step 1: Add failing SQLite contract tests.**

```js
test('saves and disables an encrypted model credential without exporting it', () => {
  const saved = store.saveModelCredential({ provider: 'deepseek', status: 'ready', ciphertext: 'cipher', iv: 'iv', authTag: 'tag', keyVersion: 1, providerModelId: 'deepseek-v4-flash' })
  expect(store.getModelCredential('deepseek')).toEqual(saved)
  expect(store.disableModelCredential('deepseek')).toMatchObject({ provider: 'deepseek', status: 'disabled', ciphertext: null })
  expect(JSON.stringify(store.exportBackup())).not.toContain('model_credentials')
  expect(JSON.stringify(store.exportBackup())).not.toContain('cipher')
})
```

- [ ] **Step 2: Run the SQLite test and verify the missing methods fail.**

Run: `npx vitest run server/database.test.mjs`

Expected: FAIL with `saveModelCredential is not a function`.

- [ ] **Step 3: Add the local table and minimal SQLite methods.**

Add the table with `status IN ('ready','disabled')` and the ready/disabled nullability check from the spec. Implement parameterized `SELECT`, `INSERT ... ON CONFLICT(provider) DO UPDATE`, and disabled tombstone writes. Do not add credentials to `exportBackup` or `restoreBackup`.

- [ ] **Step 4: Add failing Postgres adapter operations and tests.**

Extend `DeterministicQueryAdapter` with `credentials = new Map()`, clone support, and exact operations:

```text
credential:get
credential:save
credential:disable
```

Verify parameterized values, replacement of an existing ready record, and that disable clears all secret-bearing columns.

- [ ] **Step 5: Implement Postgres methods and both SQL schema artifacts.**

Create the idempotent migration containing only the new table. Append the same table to `server/schema.sql` for new installations. Use `RETURNING *` and a `credentialRow` mapper that normalizes `updated_at`.

- [ ] **Step 6: Run persistence tests and check migration text.**

Run:

```text
npx vitest run server/database.test.mjs server/postgres-store.test.mjs
git diff --check
```

Expected: all focused tests PASS; no whitespace errors.

- [ ] **Step 7: Commit persistence and migration.**

```text
git add server/database.mjs server/database.test.mjs server/postgres-store.mjs server/postgres-store.test.mjs server/schema.sql server/migrations/2026-08-21-model-credentials.sql
git commit -m "feat: persist encrypted model credentials"
```

### Task 4: Credential status and runtime resolver

**Files:**
- Create: `server/model-credential-service.mjs`
- Create: `server/model-credential-service.test.mjs`

**Interfaces:**
- Consumes: Task 1 crypto, Task 2 model probe, Task 3 store methods.
- Produces: `getDeepSeekConfig({ store, env }) -> { status, source, providerModelId?, updatedAt? }`.
- Produces: `resolveDeepSeekRuntime({ store, env }) -> { status, source, apiKey?, baseUrl?, providerModelId? }`.
- Produces: `testDeepSeekConfig({ apiKey, fetcher }) -> { models }`.
- Produces: `saveDeepSeekConfig({ store, env, apiKey, providerModelId, fetcher }) -> safe config`.
- Produces: `disableDeepSeekConfig({ store, now }) -> { status: 'disabled', source: null }`.

- [ ] **Step 1: Write the resolver matrix as failing table tests.**

```js
test.each([
  [null, {}, 'unconfigured', null],
  [null, { DEEPSEEK_API_KEY: 'legacy', DEEPSEEK_MODEL: 'legacy-model' }, 'ready', 'environment'],
  [{ status: 'disabled' }, { DEEPSEEK_API_KEY: 'legacy' }, 'disabled', null],
])('resolves database and environment precedence', async (record, env, status, source) => {
  const store = { getModelCredential: vi.fn().mockResolvedValue(record) }
  await expect(getDeepSeekConfig({ store, env })).resolves.toMatchObject({ status, source })
})
```

Add tests for a decryptable ready record, a wrong root producing `needs_reentry` without environment fallback, fixed official vault base URL, and legacy fallback preserving all three existing DeepSeek environment variables.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npx vitest run server/model-credential-service.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement the exact resolver state machine.**

Use `await` for store calls so both synchronous SQLite and asynchronous Postgres work. Never return `apiKey` from `getDeepSeekConfig`. In `saveDeepSeekConfig`, call `listDeepSeekModels` again, require an exact selected model match, encrypt, then upsert. In `disableDeepSeekConfig`, call the tombstone method and return only safe fields.

- [ ] **Step 4: Add service tests for save/test/disable and error sanitization.**

Assert testing never calls `saveModelCredential`, saving revalidates even after a prior test, a missing master key does not write, a missing provider model does not write, and disabled rows contain no ciphertext.

- [ ] **Step 5: Run focused tests.**

Run: `npx vitest run server/model-credential-service.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the resolver.**

```text
git add server/model-credential-service.mjs server/model-credential-service.test.mjs
git commit -m "feat: resolve DeepSeek credential state"
```

### Task 5: Model gateway and authenticated HTTP endpoints

**Files:**
- Modify: `server/models.mjs`
- Modify: `server/models.test.mjs`
- Modify: `server/http.mjs`
- Modify: `server/api.test.mjs`
- Modify: `api/index.test.mjs`

**Interfaces:**
- Consumes: `resolveDeepSeekRuntime`, `getDeepSeekConfig`, `testDeepSeekConfig`, `saveDeepSeekConfig`, `disableDeepSeekConfig`.
- Preserves: `publicModels(env)` and `chatWithModel(request, env, fetcher)` behavior for callers without a vault runtime.
- Adds: optional `{ deepseekStatus }` to `publicModels` and optional `{ deepseekRuntime }` fourth argument to `chatWithModel`.

- [ ] **Step 1: Write failing model gateway tests for stable IDs and resolved credentials.**

```js
test('uses a resolved vault key while keeping the stable gateway id', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '回答' } }] }), { status: 200 }))
  await chatWithModel(
    { model: 'deepseek-chat', messages: [{ role: 'user', content: '你好' }] },
    {},
    fetcher,
    { deepseekRuntime: { status: 'ready', apiKey: 'vault-key', baseUrl: 'https://api.deepseek.com', providerModelId: 'deepseek-v4-flash' } },
  )
  expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('deepseek-v4-flash')
})
```

- [ ] **Step 2: Implement optional DeepSeek runtime overrides without changing other providers.**

Only `deepseek-chat` may consume the override. The public model object must never contain `source`, Key, or upstream model ID; it only changes `available`.

- [ ] **Step 3: Add failing HTTP tests for all credential routes.**

Create servers with a test private token and a synthetic master key. Cover:

```text
GET    /api/model-configs/deepseek
POST   /api/model-configs/deepseek/test
PUT    /api/model-configs/deepseek
DELETE /api/model-configs/deepseek
```

For every method, assert: missing configured private token returns `503 PRIVATE_ACCESS_REQUIRED`; configured token without/mismatched Authorization returns `401`; successful responses contain `Cache-Control: no-store`; GET never includes `ciphertext`, `authTag`, `apiKey`, or the synthetic Key.

- [ ] **Step 4: Implement a route-specific fail-closed guard before the existing optional global guard.**

Add a small helper in `server/http.mjs`:

```js
function requireCredentialAccess(request, env) {
  if (!String(env.SIYU_PRIVATE_ACCESS_TOKEN || '').trim()) throw new ApiError('请先启用私人访问保护', 503, 'PRIVATE_ACCESS_REQUIRED')
  const access = authorizePrivateRequest(request, env)
  if (!access.ok) throw new ApiError(access.message, 401, 'PRIVATE_ACCESS_UNAUTHORIZED')
}
```

Credential request bodies use `readJson(request, 4096)`. Validate `apiKey` as a trimmed string of `8..512` characters without assuming a brittle prefix; validate `providerModelId` as `1..128` visible non-control characters.

- [ ] **Step 5: Wire `/api/models` and `/api/chat` through the resolver with safe degradation.**

For `/api/models`, catch credential-store errors and preserve legacy environment availability rather than failing the entire endpoint. For `/api/chat`, resolve only when `input.model === 'deepseek-chat'`; return a safe unavailable error for `unconfigured`, `disabled`, or `needs_reentry`. Do not let a credential error alter access-gate authentication.

- [ ] **Step 6: Run backend-focused tests.**

Run:

```text
npx vitest run server/model-credential-crypto.test.mjs server/deepseek-client.test.mjs server/model-credential-service.test.mjs server/models.test.mjs server/api.test.mjs api/index.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the HTTP integration.**

```text
git add server/models.mjs server/models.test.mjs server/http.mjs server/api.test.mjs api/index.test.mjs
git commit -m "feat: expose secure DeepSeek configuration API"
```

### Task 6: Browser API and DeepSeek settings UI

**Files:**
- Create: `src/features/models/model-config-api.ts`
- Create: `src/features/models/model-config-api.test.ts`
- Modify: `src/features/models/ModelSettings.tsx`
- Create: `src/features/models/ModelSettings.test.tsx`
- Modify: `src/features/models/model-api.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `DeepSeekConfigStatus = 'unconfigured' | 'ready' | 'needs_reentry' | 'disabled'`.
- Produces: `fetchDeepSeekConfig(signal?)`, `testDeepSeekKey(apiKey, signal?)`, `saveDeepSeekConfig(apiKey, providerModelId, signal?)`, and `disableDeepSeekConfig()`.
- `ModelSettings` receives `models`, `onClose`, and `onModelsRefresh: () => Promise<void>`.

- [ ] **Step 1: Write failing browser API tests.**

Mock `fetch`, place a synthetic private access token in local storage, and assert all requests use `authorizedFetch`, JSON content type where applicable, the correct HTTP methods, and safe response typing. Assert error text comes from the server's sanitized `error` field.

- [ ] **Step 2: Implement `model-config-api.ts`.**

```ts
export type DeepSeekConfig = {
  status: 'unconfigured' | 'ready' | 'needs_reentry' | 'disabled'
  source: 'vault' | 'environment' | null
  providerModelId?: string
  updatedAt?: string
}
```

Use one private `request<T>` helper over `authorizedFetch`; never persist `apiKey`, include it in thrown errors, or expose a getter for it.

- [ ] **Step 3: Write failing component tests for the complete secret lifecycle.**

Cover:

- DeepSeek expands to a password input while other providers remain read-only.
- Saved status never pre-fills the Key.
- Save is disabled until the current input has a successful test and a selected model.
- Any Key change invalidates the prior test.
- Close/unmount clears state and ignores a delayed test response.
- Save calls `onModelsRefresh` and clears the input.
- Disable requires confirmation, refreshes models, and shows “已停用”.
- `needs_reentry` shows a Chinese re-entry instruction.

- [ ] **Step 4: Implement the minimal state machine in `ModelSettings.tsx`.**

Keep only these secret-bearing states: `apiKey`, a monotonically increasing request generation, and the current in-flight controller. Use `type="password"`, `autoComplete="new-password"`, `spellCheck={false}`, and `autoCapitalize="none"`. On every input change, clear models, selected model, and tested generation. In cleanup, abort and set the Key to an empty string.

- [ ] **Step 5: Add the refresh callback in `App.tsx`.**

Extract a reusable `refreshModels` function that sets server models on success and fallback models on failure. Pass it to `ModelSettings`; retain existing initial topic loading behavior.

- [ ] **Step 6: Add responsive styles.**

Add scoped classes for `.deepseek-config`, password field, model select, primary/secondary/danger buttons, status banners, inline errors, disabled/loading states, and a single-column mobile layout below 760px. Reuse existing earth/fire/wood colors and do not add a new design system.

- [ ] **Step 7: Run frontend-focused tests.**

Run:

```text
npx vitest run src/features/models/model-config-api.test.ts src/features/models/ModelSettings.test.tsx src/app/App.test.tsx src/features/workspace/WorkspaceView.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the website UI.**

```text
git add src/features/models/model-config-api.ts src/features/models/model-config-api.test.ts src/features/models/ModelSettings.tsx src/features/models/ModelSettings.test.tsx src/features/models/model-api.ts src/app/App.tsx src/app/App.test.tsx src/styles/global.css
git commit -m "feat: configure DeepSeek securely in website"
```

### Task 7: Documentation, repository safety, and complete local verification

**Files:**
- Modify: `README.md`
- Modify: `docs/使用指导.md`
- Modify: `docs/AI接续说明.md`
- Modify: `miniapp/src/config/repository-safety.test.ts`

**Interfaces:**
- Documents the owner flow without containing secret values.
- Extends the existing repository safety scan to reject committed `SIYU_CREDENTIAL_MASTER_KEY=` values and credential table exports.

- [ ] **Step 1: Add failing safety assertions.**

Extend the repository scan fixtures/patterns to reject:

```text
SIYU_CREDENTIAL_MASTER_KEY=<non-empty>
"ciphertext" next to "model_credentials"
postgres:// or postgresql://
```

Allow variable names in documentation and source code, but not assignments with non-empty values.

- [ ] **Step 2: Update documentation.**

Document: open “对话服务 → API 高级配置 → DeepSeek”, paste a Key, test, choose a model, save, and use `deepseek-chat`; explain that “停用并删除” prevents legacy fallback; state that Preview writes are prohibited while databases are shared; list the new migration filename and safe statuses. Remove the obsolete instruction that DeepSeek must be configured through `.env.local` from the website help text and owner guide.

- [ ] **Step 3: Run every repository test and build.**

Run:

```text
npm test
npm run typecheck
npm run build
npm --prefix miniapp test
npm --prefix miniapp run build:weapp
npm --prefix miniapp/cloudfunctions/siyuApi test
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Run a tracked-file secret scan without printing secret-bearing files.**

Use Git's tracked file list and assert there are no prohibited secret assignments or database URL schemes outside intentionally quoted test fixtures. The scan reports only offending file names and rule IDs, never matching content.

- [ ] **Step 5: Commit docs and safety tests.**

```text
git add README.md docs/使用指导.md docs/AI接续说明.md miniapp/src/config/repository-safety.test.ts
git commit -m "docs: explain secure DeepSeek setup"
```

### Task 8: Neon migration, Vercel secret provisioning, deployment, and acceptance

**Files:**
- Verify: `server/migrations/2026-08-21-model-credentials.sql`
- Update after verification: `docs/AI接续说明.md`
- Update local archive: `D:\AI思屿\使用指导.md`, `D:\AI思屿\AI接续说明.md`, source snapshot, and SHA-256 manifest.

**Interfaces:**
- Consumes the committed migration, Vercel project `temporary-prompt-ridge-2fk9bxn`, and the already configured Neon database.
- Produces a Ready Preview and Production deployment without exposing secrets.

- [ ] **Step 1: Confirm deployment topology without reading secret values.**

List only environment variable names and targets. Confirm whether Preview and Production `DATABASE_URL` point to the same Neon branch using provider metadata that omits the connection string. If shared, mark Preview as non-destructive.

- [ ] **Step 2: Generate and provision the master key without displaying it.**

Generate 32 random bytes in process memory and write the base64url value directly to Vercel as a Sensitive `SIYU_CREDENTIAL_MASTER_KEY` for Production and Preview. Do not place the value in PowerShell history, process arguments, a file, clipboard, output, or documentation. Verify only that the variable name exists and is Sensitive. Create new deployments because environment changes do not affect previous deployments.

- [ ] **Step 3: Apply and verify the Neon migration before promotion.**

Execute the named migration on the recorded Neon project/branch/database. Query `information_schema.columns` and `pg_constraint` to verify the seven columns, primary key, status check, and ready/disabled consistency check. Verify the original six tables still exist. Do not select credential rows.

- [ ] **Step 4: Push the feature branch and wait for Preview Ready.**

Push only committed tracked files. Verify the remote tree includes the migration and excludes `.env`, `.env.local`, `data`, `.vercel`, `exports`, `output`, and credential exports.

- [ ] **Step 5: Run non-destructive Preview acceptance.**

Verify `/api/health`, private access, credential GET status, an invalid synthetic Key test, unchanged database state, topics, workspace persistence, weekly page, knowledge library, console errors, and mobile layout. Do not save, chat with, or disable a real Key in shared Preview.

- [ ] **Step 6: Promote the verified commit to Production and wait for Ready.**

Verify Production serves the exact expected Git commit. Check `/api/health` and all existing pages before entering a real Key.

- [ ] **Step 7: Complete owner-driven Production acceptance.**

In the Production browser, the owner enters the real DeepSeek Key. Verify model listing, save, safe `ready` status after refresh, `deepseek-chat` availability, and one short real conversation. Do not inspect browser request bodies, Vercel logs, or database ciphertext during this test. Do not run disable/delete unless the owner explicitly requests it after successful use.

- [ ] **Step 8: Update the local archive safely.**

Copy the verified tracked source snapshot and updated guides to `D:\AI思屿`, excluding all forbidden paths and `model_credentials`. Rebuild the SHA-256 manifest, verify a clean extraction/build from the archive, and record only commit hashes, public URLs, variable names, deployment status, and schema version.

- [ ] **Step 9: Final verification and handoff.**

Re-run the full test/build commands from Task 7 against the exact deployed commit; verify Production `/api/health`, existing content persistence, DeepSeek safe status, and no console errors. Report public URLs and commit hashes, never secret values.

## Self-Review Record

- Spec coverage: all 14 spec sections map to Tasks 1–8; mini-program native chat is explicitly excluded and regression-tested only.
- Placeholder scan: every task names concrete files, interfaces, commands, expected failures, implementations, and verification evidence.
- Type consistency: the stable client ID is `deepseek-chat`; upstream IDs consistently use `providerModelId`; safe statuses are exactly `unconfigured | ready | needs_reentry | disabled`; sources are exactly `vault | environment | null`.
- Deployment safety: destructive Preview testing is prohibited while the database is shared; the master key is generated and provisioned without an intermediate file or printed value.
