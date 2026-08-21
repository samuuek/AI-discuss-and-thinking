const MODELS_URL = 'https://api.deepseek.com/models'
const MAX_RESPONSE_BYTES = 256 * 1024
const MAX_MODELS = 100

export class DeepSeekProviderError extends Error {
  constructor(code, status, message) {
    super(message)
    this.code = code
    this.status = status
  }
}

function providerError(status) {
  if (status === 401 || status === 403) return new DeepSeekProviderError('PROVIDER_AUTH_INVALID', 400, 'API Key 无效或无权限')
  if (status === 402) return new DeepSeekProviderError('PROVIDER_BALANCE_INSUFFICIENT', 400, 'DeepSeek 账户余额不足')
  if (status === 429) return new DeepSeekProviderError('PROVIDER_RATE_LIMITED', 429, 'DeepSeek 请求过于频繁，请稍后再试')
  return new DeepSeekProviderError('PROVIDER_UNAVAILABLE', 503, 'DeepSeek 服务暂时不可用')
}

const invalidResponse = () => new DeepSeekProviderError('PROVIDER_RESPONSE_INVALID', 502, 'DeepSeek 返回了无效的模型列表')

async function readBoundedText(response) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw invalidResponse()
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw invalidResponse()
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function parseModels(text) {
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw invalidResponse()
  }
  if (!payload || !Array.isArray(payload.data) || payload.data.length > MAX_MODELS) throw invalidResponse()

  const models = []
  const seen = new Set()
  for (const item of payload.data) {
    if (!item || typeof item.id !== 'string') continue
    const id = item.id.trim()
    if (!id || id.length > 128 || /[\u0000-\u001f\u007f]/.test(id) || seen.has(id)) continue
    seen.add(id)
    models.push(id)
  }
  if (models.length === 0) throw invalidResponse()
  return models
}

export async function listDeepSeekModels({ apiKey, fetcher = fetch, timeoutMs = 8_000 }) {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetcher(MODELS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw providerError(response.status)
    return parseModels(await readBoundedText(response))
  } catch (error) {
    if (error instanceof DeepSeekProviderError) throw error
    if (timedOut || controller.signal.aborted) {
      throw new DeepSeekProviderError('PROVIDER_TIMEOUT', 504, 'DeepSeek 连接超时，请稍后再试')
    }
    throw new DeepSeekProviderError('PROVIDER_UNAVAILABLE', 503, 'DeepSeek 服务暂时不可用')
  } finally {
    clearTimeout(timeout)
  }
}
