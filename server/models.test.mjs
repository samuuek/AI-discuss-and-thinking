// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'
import { chatWithModel, publicModels } from './models.mjs'

describe('production model gateway', () => {
  test('publishes availability without exposing API keys', () => {
    const models = publicModels({ DEEPSEEK_API_KEY: 'secret-value' })
    expect(models.find(model => model.id === 'deepseek-chat')?.available).toBe(true)
    expect(models.find(model => model.id === 'doubao-pro')?.available).toBe(false)
    expect(JSON.stringify(models)).not.toContain('secret-value')
  })

  test('rejects an unknown model', async () => {
    await expect(chatWithModel({ model: 'unknown', messages: [] }, {}, vi.fn())).rejects.toThrow('不支持的模型')
  })

  test('forwards compatible requests with server-side bearer auth', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '回答' } }] }) })
    await expect(chatWithModel({ model: 'deepseek-chat', messages: [{ role: 'user', content: '你好' }] }, { DEEPSEEK_API_KEY: 'secret' }, fetcher)).resolves.toBe('回答')
    expect(fetcher).toHaveBeenCalledWith('https://api.deepseek.com/chat/completions', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }))
  })

  test('publishes vault availability without exposing its source or upstream model', () => {
    const models = publicModels({}, { deepseekStatus: { status: 'ready', source: 'vault', providerModelId: 'deepseek-v4-flash' } })
    const deepseek = models.find(model => model.id === 'deepseek-chat')

    expect(deepseek).toMatchObject({ id: 'deepseek-chat', available: true })
    expect(deepseek).not.toHaveProperty('source')
    expect(JSON.stringify(deepseek)).not.toContain('deepseek-v4-flash')
  })

  test('uses a resolved vault key while keeping the stable gateway id', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '回答' } }] }) })

    await expect(chatWithModel(
      { model: 'deepseek-chat', messages: [{ role: 'user', content: '你好' }] },
      {},
      fetcher,
      { deepseekRuntime: { status: 'ready', source: 'vault', apiKey: 'vault-key', baseUrl: 'https://api.deepseek.com', providerModelId: 'deepseek-v4-flash' } },
    )).resolves.toBe('回答')

    const [, init] = fetcher.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer vault-key')
    expect(JSON.parse(init.body).model).toBe('deepseek-v4-flash')
  })
})
