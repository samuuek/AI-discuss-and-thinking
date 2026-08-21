import { expect, test, vi } from 'vitest'
import { createCloudTransport } from './cloud-transport'

test('unwraps a successful WeChat cloud action', async () => {
  const callFunction = vi.fn().mockResolvedValue({ result: { ok: true, data: { topics: [] } } })
  const transport = createCloudTransport(callFunction)

  await expect(transport.call('fetchTopics')).resolves.toEqual({ topics: [] })
  expect(callFunction).toHaveBeenCalledWith({
    name: 'siyuApi',
    data: { action: 'fetchTopics', payload: {} },
  })
})

test('turns a rejected owner into a Chinese error', async () => {
  const transport = createCloudTransport(vi.fn().mockResolvedValue({
    result: { ok: false, error: '此微信账号无权访问思屿', code: 'CLOUD_REQUEST_FAILED' },
  }))

  await expect(transport.call('health')).rejects.toThrow('此微信账号无权访问思屿')
})

test('stops waiting when WeChat does not return a cloud result', async () => {
  vi.useFakeTimers()
  try {
    const transport = createCloudTransport(() => new Promise(() => {}), { timeoutMs: 12_000 })
    const pending = transport.call('health')
    const rejection = expect(pending).rejects.toThrow('微信云服务连接超时')

    await vi.advanceTimersByTimeAsync(12_000)

    await rejection
  } finally {
    vi.useRealTimers()
  }
})
