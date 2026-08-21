// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'
import { DeepSeekProviderError, listDeepSeekModels } from './deepseek-client.mjs'

const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
})

describe('DeepSeek model probe', () => {
  test('returns bounded unique model ids in provider order', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      object: 'list',
      data: [
        { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
        { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
        { id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' },
      ],
    }))

    await expect(listDeepSeekModels({ apiKey: 'synthetic-key', fetcher })).resolves.toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ])
    expect(fetcher).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.objectContaining({
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: 'Bearer synthetic-key', Accept: 'application/json' },
    }))
  })

  test.each([
    { status: 401, code: 'PROVIDER_AUTH_INVALID', message: 'API Key 无效或无权限' },
    { status: 403, code: 'PROVIDER_AUTH_INVALID', message: 'API Key 无效或无权限' },
    { status: 402, code: 'PROVIDER_BALANCE_INSUFFICIENT', message: 'DeepSeek 账户余额不足' },
    { status: 429, code: 'PROVIDER_RATE_LIMITED', message: 'DeepSeek 请求过于频繁，请稍后再试' },
    { status: 503, code: 'PROVIDER_UNAVAILABLE', message: 'DeepSeek 服务暂时不可用' },
  ])('maps provider status $status to $code without exposing its body', async ({ status, code, message }) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('upstream-secret-detail', { status }))

    try {
      await listDeepSeekModels({ apiKey: 'synthetic-key', fetcher })
      throw new Error('expected provider error')
    } catch (error) {
      expect(error).toBeInstanceOf(DeepSeekProviderError)
      expect(error).toMatchObject({ code, message })
      expect(error.message).not.toContain('upstream-secret-detail')
      expect(error.message).not.toContain('synthetic-key')
    }
  })

  test('times out a stalled provider request', async () => {
    const fetcher = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))

    await expect(listDeepSeekModels({ apiKey: 'synthetic-key', fetcher, timeoutMs: 5 }))
      .rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', message: 'DeepSeek 连接超时，请稍后再试' })
  })

  test.each([
    ['invalid JSON', new Response('{bad', { status: 200 })],
    ['invalid shape', jsonResponse({ data: [{ object: 'model' }] })],
    ['too many models', jsonResponse({ data: Array.from({ length: 101 }, (_, index) => ({ id: `model-${index}`, object: 'model' })) })],
    ['oversized response', new Response('x'.repeat(256 * 1024 + 1), { status: 200 })],
  ])('rejects a %s response with a sanitized error', async (_name, response) => {
    const fetcher = vi.fn().mockResolvedValue(response)

    await expect(listDeepSeekModels({ apiKey: 'synthetic-key', fetcher }))
      .rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID', message: 'DeepSeek 返回了无效的模型列表' })
  })

  test('rejects control characters and overlong model ids', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: [
      { id: 'valid-model', object: 'model' },
      { id: 'line\nbreak', object: 'model' },
      { id: 'x'.repeat(129), object: 'model' },
    ] }))

    await expect(listDeepSeekModels({ apiKey: 'synthetic-key', fetcher })).resolves.toEqual(['valid-model'])
  })
})
