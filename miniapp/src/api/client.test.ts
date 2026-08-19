import { describe, expect, test, vi } from 'vitest'
import { createApiClient } from './client-core'

const config = { apiBaseUrl: 'https://example.com', getAccessToken: () => '' }

describe('mini-program API client', () => {
  test('adds the device bearer token to topic requests', async () => {
    const request = vi.fn().mockResolvedValue({ statusCode: 200, data: { topics: [] } })
    const client = createApiClient({ apiBaseUrl: 'https://example.com', getAccessToken: () => 'device-secret' }, request)

    await client.fetchTopics()

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/api/topics',
      header: expect.objectContaining({ Authorization: 'Bearer device-secret' }),
    }))
  })

  test('returns the Chinese server error for a failed request', async () => {
    const request = vi.fn().mockResolvedValue({ statusCode: 503, data: { error: '服务暂时不可用' } })
    await expect(createApiClient(config, request).fetchTopics()).rejects.toThrow('服务暂时不可用')
  })

  test('turns unauthorized responses into a local reconfiguration prompt', async () => {
    const request = vi.fn().mockResolvedValue({ statusCode: 401, data: { error: '私人访问验证失败' } })
    await expect(createApiClient(config, request).fetchTopics()).rejects.toThrow('私人访问已失效，请重新配置')
  })
})
