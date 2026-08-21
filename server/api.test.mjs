// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDatabase } from './database.mjs'
import { createApiServer } from './http.mjs'

describe('local HTTP API', () => {
  let store
  let server
  let origin

  async function restart(options) {
    await new Promise(resolve => server.close(resolve))
    server = createApiServer({ store, ...options })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${server.address().port}`
  }

  beforeEach(async () => {
    store = createDatabase(':memory:')
    server = createApiServer({ store, env: {}, fetcher: vi.fn() })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    await new Promise(resolve => server.close(resolve))
    store.close()
  })

  test('reports health and returns topics', async () => {
    expect(await fetch(`${origin}/api/health`).then(response => response.json())).toMatchObject({ ok: true, database: 'ready' })
    const payload = await fetch(`${origin}/api/topics`).then(response => response.json())
    expect(payload.topics).toHaveLength(3)
  })

  test('keeps health public while protecting personal data when configured', async () => {
    await new Promise(resolve => server.close(resolve))
    server = createApiServer({ store, env: { SIYU_PRIVATE_ACCESS_TOKEN: 'private-test-token' } })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${server.address().port}`

    const health = await fetch(`${origin}/api/health`)
    expect(health.status).toBe(200)
    expect((await health.json()).privateAccessRequired).toBe(true)
    expect((await fetch(`${origin}/api/topics`)).status).toBe(401)
    const authorized = await fetch(`${origin}/api/topics`, { headers: { Authorization: 'Bearer private-test-token' } })
    expect(authorized.status).toBe(200)
  })

  test.each([
    ['GET', '/api/model-configs/deepseek', undefined],
    ['POST', '/api/model-configs/deepseek/test', { apiKey: 'synthetic-key' }],
    ['PUT', '/api/model-configs/deepseek', { apiKey: 'synthetic-key', providerModelId: 'deepseek-v4-flash' }],
    ['DELETE', '/api/model-configs/deepseek', undefined],
  ])('fails closed for %s %s when private access is not configured', async (method, path, body) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: '请先启用私人访问保护', code: 'PRIVATE_ACCESS_REQUIRED' })
  })

  test.each([
    ['GET', '/api/model-configs/deepseek', undefined],
    ['POST', '/api/model-configs/deepseek/test', { apiKey: 'synthetic-key' }],
    ['PUT', '/api/model-configs/deepseek', { apiKey: 'synthetic-key', providerModelId: 'deepseek-v4-flash' }],
    ['DELETE', '/api/model-configs/deepseek', undefined],
  ])('requires the correct bearer token for %s %s', async (method, path, body) => {
    await restart({ env: { SIYU_PRIVATE_ACCESS_TOKEN: 'private-test-token' }, fetcher: vi.fn() })

    const response = await fetch(`${origin}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '私人访问验证失败', code: 'PRIVATE_ACCESS_UNAUTHORIZED' })
  })

  test('tests, saves, resolves, and disables a DeepSeek credential without returning the key', async () => {
    const masterKey = Buffer.alloc(32, 7).toString('base64url')
    const fetcher = vi.fn(async url => {
      if (url.endsWith('/models')) return new Response(JSON.stringify({
        object: 'list',
        data: [{ id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: '来自保险库的回答' } }] }), { status: 200 })
      throw new Error('unexpected URL')
    })
    const env = {
      SIYU_PRIVATE_ACCESS_TOKEN: 'private-test-token',
      SIYU_CREDENTIAL_MASTER_KEY: masterKey,
      DEEPSEEK_API_KEY: 'legacy-key',
    }
    await restart({ env, fetcher })
    const headers = { Authorization: 'Bearer private-test-token', 'Content-Type': 'application/json' }

    const initial = await fetch(`${origin}/api/model-configs/deepseek`, { headers })
    expect(initial.headers.get('cache-control')).toBe('no-store')
    expect(await initial.json()).toMatchObject({ status: 'ready', source: 'environment' })

    const tested = await fetch(`${origin}/api/model-configs/deepseek/test`, {
      method: 'POST', headers, body: JSON.stringify({ apiKey: 'synthetic-key' }),
    })
    expect(await tested.json()).toEqual({ models: ['deepseek-v4-flash'] })
    expect(store.getModelCredential('deepseek')).toBeNull()

    const saved = await fetch(`${origin}/api/model-configs/deepseek`, {
      method: 'PUT', headers, body: JSON.stringify({ apiKey: 'synthetic-key', providerModelId: 'deepseek-v4-flash' }),
    })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ status: 'ready', source: 'vault', providerModelId: 'deepseek-v4-flash' })
    expect(JSON.stringify(store.getModelCredential('deepseek'))).not.toContain('synthetic-key')

    const safeStatus = await fetch(`${origin}/api/model-configs/deepseek`, { headers }).then(response => response.json())
    expect(safeStatus).not.toHaveProperty('apiKey')
    expect(safeStatus).not.toHaveProperty('ciphertext')

    const models = await fetch(`${origin}/api/models`, { headers }).then(response => response.json())
    expect(models.models.find(model => model.id === 'deepseek-chat')?.available).toBe(true)

    const chat = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: '你好' }] }),
    })
    expect(await chat.json()).toMatchObject({ content: '来自保险库的回答' })

    const disabled = await fetch(`${origin}/api/model-configs/deepseek`, { method: 'DELETE', headers })
    expect(await disabled.json()).toMatchObject({ status: 'disabled', source: null })
    expect(store.getModelCredential('deepseek')).toMatchObject({ status: 'disabled', ciphertext: null })
    const disabledModels = await fetch(`${origin}/api/models`, { headers }).then(response => response.json())
    expect(disabledModels.models.find(model => model.id === 'deepseek-chat')?.available).toBe(false)
  })

  test('creates one stable set of daily topics and does not duplicate it on refresh', async () => {
    await new Promise(resolve => server.close(resolve))
    server = createApiServer({ store, env: {}, now: () => new Date('2026-08-18T02:00:00.000Z') })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${server.address().port}`

    const first = await fetch(`${origin}/api/topics/daily`, { method: 'POST' }).then(response => response.json())
    const second = await fetch(`${origin}/api/topics/daily`, { method: 'POST' }).then(response => response.json())

    expect(first.topics).toHaveLength(3)
    expect(first.topics.map(topic => topic.id)).toEqual([
      'daily-2026-08-18-1',
      'daily-2026-08-18-2',
      'daily-2026-08-18-3',
    ])
    expect(second.topics.map(topic => topic.id)).toEqual(first.topics.map(topic => topic.id))
    expect(store.listTopics().filter(topic => topic.id.startsWith('daily-2026-08-18-'))).toHaveLength(3)
  })

  test('awaits asynchronous topic listings', async () => {
    const asyncStore = {
      listTopics: async () => [{ id: 'async-topic', title: '异步议题' }],
    }
    const asyncServer = createApiServer({ store: asyncStore, env: {} })
    await new Promise(resolve => asyncServer.listen(0, '127.0.0.1', resolve))

    try {
      const asyncOrigin = `http://127.0.0.1:${asyncServer.address().port}`
      const payload = await fetch(`${asyncOrigin}/api/topics`).then(response => response.json())
      expect(payload.topics).toEqual([{ id: 'async-topic', title: '异步议题' }])
    } finally {
      await new Promise(resolve => asyncServer.close(resolve))
    }
  })

  test('validates writes and uses a consistent error shape', async () => {
    const response = await fetch(`${origin}/api/topics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '' }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '议题标题不能为空', code: 'VALIDATION_ERROR' })
  })

  test('rejects an invalid backup as a client validation error', async () => {
    const response = await fetch(`${origin}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, topics: [] }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '备份文件格式不受支持', code: 'VALIDATION_ERROR' })
  })

  test('rejects an unsupported chat model as a client validation error', async () => {
    const response = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'unsupported-model', messages: [{ role: 'user', content: '你好' }] }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '不支持的模型', code: 'VALIDATION_ERROR' })
  })

  test('persists workspace changes through the API', async () => {
    const response = await fetch(`${origin}/api/workspaces/ai-memory`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: '只写给自己' }) })
    expect(response.status).toBe(200)
    const workspace = await fetch(`${origin}/api/workspaces/ai-memory`).then(result => result.json())
    expect(workspace.workspace.note).toBe('只写给自己')
  })

  test('returns not found for a missing workspace', async () => {
    const response = await fetch(`${origin}/api/workspaces/missing-topic`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: '思考空间不存在', code: 'NOT_FOUND' })
  })

  test('returns model content and stores both sides of a chat', async () => {
    const response = await fetch(`${origin}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topicId: 'ai-memory', model: 'siyu-demo', messages: [{ role: 'user', content: '你好' }] }) })
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.content).toContain('演示回复')
    expect(store.listMessages('ai-memory').map(message => message.role)).toEqual(['user', 'assistant'])
  })

  test('exports and restores backup data', async () => {
    const backup = await fetch(`${origin}/api/backup`).then(response => response.json())
    const response = await fetch(`${origin}/api/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ restored: true })
  })

  test('refreshes weekly sources independently and preserves partial success', async () => {
    await new Promise(resolve => server.close(resolve))
    const sources = [
      { id: 'openai', organization: 'OpenAI', url: 'https://openai.com/news/', allowedHosts: ['openai.com'], category: '产品' },
      { id: 'meta', organization: 'Meta AI', url: 'https://ai.meta.com/blog/', allowedHosts: ['ai.meta.com'], category: '研究' },
    ]
    server = createApiServer({ store, env: {}, weeklySources: sources, weeklyFetcher: vi.fn(async source => {
      if (source.id === 'meta') throw new Error('timeout')
      return [{ id: 'weekly-a', sourceId: 'openai', organization: 'OpenAI', title: 'A', url: 'https://openai.com/a', publishedAt: new Date().toISOString(), category: '产品', summary: 's', significance: '' }]
    }) })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${server.address().port}`

    const response = await fetch(`${origin}/api/weekly/refresh`, { method: 'POST' })
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.items.map(item => item.id)).toContain('weekly-a')
    expect(payload.sources.find(source => source.id === 'meta')?.error).toBe('timeout')
  })

  test('saves a weekly translation alongside analyst results', async () => {
    const response = await fetch(`${origin}/api/weekly/analyses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analystId: 'weekly-translation', fingerprint: 'material-v1', markdown: '[{"id":"a","title":"中文标题","summary":"中文摘要"}]' }) })
    expect(response.status).toBe(201)
    expect((await response.json()).analysis.analystId).toBe('weekly-translation')
  })
})
