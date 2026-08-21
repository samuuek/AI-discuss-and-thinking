import { CredentialDecryptError, CredentialKeyError, decryptModelCredential, encryptModelCredential } from './model-credential-crypto.mjs'
import { listDeepSeekModels } from './deepseek-client.mjs'

const PROVIDER = 'deepseek'
const OFFICIAL_BASE_URL = 'https://api.deepseek.com'

export class ModelCredentialServiceError extends Error {
  constructor(code, status, message) {
    super(message)
    this.code = code
    this.status = status
  }
}

function environmentRuntime(env) {
  const apiKey = String(env.DEEPSEEK_API_KEY || '').trim()
  if (!apiKey) return { status: 'unconfigured', source: null }
  return {
    status: 'ready',
    source: 'environment',
    apiKey,
    baseUrl: String(env.DEEPSEEK_BASE_URL || OFFICIAL_BASE_URL).trim().replace(/\/$/, ''),
    providerModelId: String(env.DEEPSEEK_MODEL || 'deepseek-chat').trim(),
  }
}

async function resolve({ store, env }) {
  const record = await store.getModelCredential(PROVIDER)
  if (!record) return environmentRuntime(env)
  if (record.status === 'disabled') return { status: 'disabled', source: null, updatedAt: record.updatedAt }
  if (record.status !== 'ready') return { status: 'needs_reentry', source: null }

  try {
    const credential = decryptModelCredential(record, env.SIYU_CREDENTIAL_MASTER_KEY)
    return {
      status: 'ready',
      source: 'vault',
      apiKey: credential.apiKey,
      baseUrl: OFFICIAL_BASE_URL,
      providerModelId: credential.providerModelId,
      updatedAt: record.updatedAt,
    }
  } catch (error) {
    if (error instanceof CredentialDecryptError || error instanceof CredentialKeyError) {
      return { status: 'needs_reentry', source: null }
    }
    throw error
  }
}

export async function resolveDeepSeekRuntime({ store, env = process.env }) {
  const runtime = await resolve({ store, env })
  if (runtime.status !== 'ready') {
    return { status: runtime.status, source: runtime.source }
  }
  return {
    status: runtime.status,
    source: runtime.source,
    apiKey: runtime.apiKey,
    baseUrl: runtime.baseUrl,
    providerModelId: runtime.providerModelId,
  }
}

export async function getDeepSeekConfig({ store, env = process.env }) {
  const runtime = await resolve({ store, env })
  const safe = { status: runtime.status, source: runtime.source }
  if (runtime.status === 'ready') safe.providerModelId = runtime.providerModelId
  if (runtime.updatedAt) safe.updatedAt = runtime.updatedAt
  return safe
}

export async function testDeepSeekConfig({ apiKey, fetcher = fetch }) {
  return { models: await listDeepSeekModels({ apiKey, fetcher }) }
}

export async function saveDeepSeekConfig({ store, env = process.env, apiKey, providerModelId, fetcher = fetch }) {
  const models = await listDeepSeekModels({ apiKey, fetcher })
  if (!models.includes(providerModelId)) {
    throw new ModelCredentialServiceError('PROVIDER_MODEL_INVALID', 400, '所选 DeepSeek 模型当前不可用')
  }

  const encrypted = encryptModelCredential({
    provider: PROVIDER,
    apiKey,
    providerModelId,
    masterKey: env.SIYU_CREDENTIAL_MASTER_KEY,
  })
  const saved = await store.saveModelCredential(encrypted)
  return {
    status: 'ready',
    source: 'vault',
    providerModelId: saved.providerModelId,
    updatedAt: saved.updatedAt,
  }
}

export async function disableDeepSeekConfig({ store, now = () => new Date() }) {
  const updatedAt = now().toISOString()
  const disabled = await store.disableModelCredential(PROVIDER, updatedAt)
  return { status: 'disabled', source: null, updatedAt: disabled.updatedAt }
}
