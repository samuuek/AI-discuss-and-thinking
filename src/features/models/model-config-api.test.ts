import { beforeEach, expect, test, vi } from 'vitest'
import {
  disableDeepSeekConfig,
  fetchDeepSeekConfig,
  saveDeepSeekConfig,
  testDeepSeekKey,
} from './model-config-api'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('siyu-private-access-token', 'private-test-token')
  vi.restoreAllMocks()
})

test('reads only the safe DeepSeek configuration status', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    status: 'ready',
    source: 'vault',
    providerModelId: 'deepseek-v4-flash',
    updatedAt: '2026-08-21T12:00:00.000Z',
  }), { status: 200 }))
  vi.stubGlobal('fetch', fetcher)

  await expect(fetchDeepSeekConfig()).resolves.toMatchObject({ status: 'ready', source: 'vault' })
  const [, init] = fetcher.mock.calls[0]
  expect(fetcher.mock.calls[0][0]).toBe('/api/model-configs/deepseek')
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer private-test-token')
})

test('tests and saves the current key through authenticated JSON requests', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ models: ['deepseek-v4-flash'] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ready', source: 'vault', providerModelId: 'deepseek-v4-flash' }), { status: 200 }))
  vi.stubGlobal('fetch', fetcher)

  await expect(testDeepSeekKey('synthetic-key')).resolves.toEqual(['deepseek-v4-flash'])
  await expect(saveDeepSeekConfig('synthetic-key', 'deepseek-v4-flash')).resolves.toMatchObject({ status: 'ready' })

  expect(fetcher.mock.calls.map(call => [call[0], call[1].method, JSON.parse(call[1].body)])).toEqual([
    ['/api/model-configs/deepseek/test', 'POST', { apiKey: 'synthetic-key' }],
    ['/api/model-configs/deepseek', 'PUT', { apiKey: 'synthetic-key', providerModelId: 'deepseek-v4-flash' }],
  ])
})

test('disables the saved credential without sending a request body', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'disabled', source: null }), { status: 200 }))
  vi.stubGlobal('fetch', fetcher)

  await expect(disableDeepSeekConfig()).resolves.toMatchObject({ status: 'disabled', source: null })
  expect(fetcher.mock.calls[0][0]).toBe('/api/model-configs/deepseek')
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
  expect(fetcher.mock.calls[0][1].body).toBeUndefined()
})

test('uses the server sanitized error message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'API Key 无效或无权限', code: 'PROVIDER_AUTH_INVALID' }), { status: 400 })))

  await expect(testDeepSeekKey('synthetic-key')).rejects.toThrow('API Key 无效或无权限')
})
