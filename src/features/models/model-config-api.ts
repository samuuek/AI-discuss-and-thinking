import { authorizedFetch } from '../../lib/access-token'

export type DeepSeekConfigStatus = 'unconfigured' | 'ready' | 'needs_reentry' | 'disabled'
export type DeepSeekConfig = {
  status: DeepSeekConfigStatus
  source: 'vault' | 'environment' | null
  providerModelId?: string
  updatedAt?: string
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(url, init)
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'DeepSeek 配置请求失败')
  return data
}

function json(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }
}

export function fetchDeepSeekConfig(signal?: AbortSignal): Promise<DeepSeekConfig> {
  return request('/api/model-configs/deepseek', { signal })
}

export async function testDeepSeekKey(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  return (await request<{ models: string[] }>('/api/model-configs/deepseek/test', json('POST', { apiKey }, signal))).models
}

export function saveDeepSeekConfig(apiKey: string, providerModelId: string, signal?: AbortSignal): Promise<DeepSeekConfig> {
  return request('/api/model-configs/deepseek', json('PUT', { apiKey, providerModelId }, signal))
}

export function disableDeepSeekConfig(): Promise<DeepSeekConfig> {
  return request('/api/model-configs/deepseek', { method: 'DELETE' })
}
