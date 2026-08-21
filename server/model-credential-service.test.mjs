// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDatabase } from './database.mjs'
import {
  disableDeepSeekConfig,
  getDeepSeekConfig,
  resolveDeepSeekRuntime,
  saveDeepSeekConfig,
  testDeepSeekConfig,
} from './model-credential-service.mjs'

const masterKey = randomBytes(32).toString('base64url')
const providerPayload = {
  object: 'list',
  data: [
    { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
    { id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' },
  ],
}
const successfulFetcher = () => vi.fn().mockResolvedValue(new Response(JSON.stringify(providerPayload), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
}))

describe('DeepSeek credential service', () => {
  let store

  beforeEach(() => { store = createDatabase(':memory:', { seed: false }) })
  afterEach(() => store.close())

  test.each([
    { env: {}, status: 'unconfigured', source: null },
    { env: { DEEPSEEK_API_KEY: 'legacy' }, status: 'ready', source: 'environment' },
  ])('resolves an empty vault as $status', async ({ env, status, source }) => {
    await expect(getDeepSeekConfig({ store, env })).resolves.toMatchObject({ status, source })
  })

  test('preserves all legacy DeepSeek environment settings when the vault is empty', async () => {
    await expect(resolveDeepSeekRuntime({ store, env: {
      DEEPSEEK_API_KEY: 'legacy-key',
      DEEPSEEK_BASE_URL: 'https://legacy.example/v1/',
      DEEPSEEK_MODEL: 'legacy-model',
    } })).resolves.toEqual({
      status: 'ready',
      source: 'environment',
      apiKey: 'legacy-key',
      baseUrl: 'https://legacy.example/v1',
      providerModelId: 'legacy-model',
    })
  })

  test('saves a verified credential and resolves it with the fixed official origin', async () => {
    const fetcher = successfulFetcher()
    await expect(saveDeepSeekConfig({
      store,
      env: { SIYU_CREDENTIAL_MASTER_KEY: masterKey },
      apiKey: 'synthetic-key',
      providerModelId: 'deepseek-v4-flash',
      fetcher,
    })).resolves.toMatchObject({
      status: 'ready',
      source: 'vault',
      providerModelId: 'deepseek-v4-flash',
    })

    expect(JSON.stringify(store.getModelCredential('deepseek'))).not.toContain('synthetic-key')
    await expect(resolveDeepSeekRuntime({
      store,
      env: {
        SIYU_CREDENTIAL_MASTER_KEY: masterKey,
        DEEPSEEK_API_KEY: 'legacy-key',
        DEEPSEEK_BASE_URL: 'https://legacy.example',
      },
    })).resolves.toEqual({
      status: 'ready',
      source: 'vault',
      apiKey: 'synthetic-key',
      baseUrl: 'https://api.deepseek.com',
      providerModelId: 'deepseek-v4-flash',
    })
  })

  test('marks a vault record for re-entry instead of falling back after decryption fails', async () => {
    await saveDeepSeekConfig({
      store,
      env: { SIYU_CREDENTIAL_MASTER_KEY: masterKey },
      apiKey: 'synthetic-key',
      providerModelId: 'deepseek-v4-pro',
      fetcher: successfulFetcher(),
    })

    await expect(resolveDeepSeekRuntime({
      store,
      env: { SIYU_CREDENTIAL_MASTER_KEY: randomBytes(32).toString('base64url'), DEEPSEEK_API_KEY: 'legacy-key' },
    })).resolves.toEqual({ status: 'needs_reentry', source: null })
  })

  test('tests a key without persisting it', async () => {
    await expect(testDeepSeekConfig({ apiKey: 'synthetic-key', fetcher: successfulFetcher() })).resolves.toEqual({
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    })
    expect(store.getModelCredential('deepseek')).toBeNull()
  })

  test('does not save when the selected provider model is absent', async () => {
    await expect(saveDeepSeekConfig({
      store,
      env: { SIYU_CREDENTIAL_MASTER_KEY: masterKey },
      apiKey: 'synthetic-key',
      providerModelId: 'missing-model',
      fetcher: successfulFetcher(),
    })).rejects.toMatchObject({ code: 'PROVIDER_MODEL_INVALID' })
    expect(store.getModelCredential('deepseek')).toBeNull()
  })

  test('does not save when the encryption master key is missing', async () => {
    await expect(saveDeepSeekConfig({
      store,
      env: {},
      apiKey: 'synthetic-key',
      providerModelId: 'deepseek-v4-flash',
      fetcher: successfulFetcher(),
    })).rejects.toThrow('凭据加密服务未正确配置')
    expect(store.getModelCredential('deepseek')).toBeNull()
  })

  test('writes a disabled tombstone that suppresses legacy environment fallback', async () => {
    await saveDeepSeekConfig({
      store,
      env: { SIYU_CREDENTIAL_MASTER_KEY: masterKey },
      apiKey: 'synthetic-key',
      providerModelId: 'deepseek-v4-flash',
      fetcher: successfulFetcher(),
    })

    await expect(disableDeepSeekConfig({ store, now: () => new Date('2026-08-21T12:00:00.000Z') })).resolves.toEqual({
      status: 'disabled',
      source: null,
      updatedAt: '2026-08-21T12:00:00.000Z',
    })
    expect(store.getModelCredential('deepseek')).toMatchObject({ status: 'disabled', ciphertext: null })
    await expect(resolveDeepSeekRuntime({ store, env: { DEEPSEEK_API_KEY: 'legacy-key' } }))
      .resolves.toEqual({ status: 'disabled', source: null })
  })
})
