// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { createVercelHandler } from './index.mjs'

function createResponse() {
  let resolveFinished
  const finished = new Promise(resolve => { resolveFinished = resolve })
  return {
    statusCode: undefined,
    headers: undefined,
    body: '',
    finished,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    },
    end(body = '') {
      this.body = body
      resolveFinished()
    },
  }
}

describe('Vercel API entry', () => {
  test('returns a successful health response with an injected async store', async () => {
    const store = { async close() {} }
    const handler = createVercelHandler({ store })
    const response = createResponse()

    await handler({ method: 'GET', url: '/api/health' }, response)
    await response.finished

    expect(response.statusCode).toBe(200)
    expect(response.headers).toMatchObject({ 'Content-Type': 'application/json; charset=utf-8' })
    expect(JSON.parse(response.body)).toEqual({ ok: true, database: 'ready' })
  })

  test('returns a safe unavailable response when DATABASE_URL is missing', async () => {
    const handler = createVercelHandler({ env: {} })
    const response = createResponse()

    await handler({ method: 'GET', url: '/api/topics' }, response)
    await response.finished

    expect(response.statusCode).toBe(503)
    expect(JSON.parse(response.body)).toEqual({
      error: '数据库服务未配置',
      code: 'DATABASE_UNAVAILABLE',
    })
  })

  test('reuses one Neon-backed store across warm invocations', async () => {
    let sqlCreations = 0
    let storeCreations = 0
    const asyncStore = { async listTopics() { return [] } }
    const handler = createVercelHandler({
      env: { DATABASE_URL: 'configured-for-test' },
      createSql() {
        sqlCreations += 1
        return function sql() {}
      },
      createStore() {
        storeCreations += 1
        return asyncStore
      },
    })

    for (let invocation = 0; invocation < 2; invocation += 1) {
      const response = createResponse()
      await handler({ method: 'GET', url: '/api/topics' }, response)
      await response.finished
      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ topics: [] })
    }

    expect(sqlCreations).toBe(1)
    expect(storeCreations).toBe(1)
  })

  test('does not expose DATABASE_URL when store initialization fails', async () => {
    const marker = 'DO_NOT_EXPOSE'
    const handler = createVercelHandler({
      env: { DATABASE_URL: `configured-${marker}` },
      createSql(databaseUrl) {
        throw new Error(`failed to initialize ${databaseUrl}`)
      },
    })
    const response = createResponse()

    await handler({ method: 'GET', url: '/api/health' }, response)
    await response.finished

    expect(response.statusCode).toBe(503)
    expect(response.body).not.toContain(marker)
    expect(JSON.parse(response.body)).toEqual({
      error: '数据库服务暂时不可用',
      code: 'DATABASE_UNAVAILABLE',
    })
  })

  test('dispatches the original API path forwarded by the Vercel rewrite', async () => {
    const handler = createVercelHandler({ store: { async close() {} } })
    const response = createResponse()

    await handler({ method: 'GET', url: '/api/index?__siyu_api_path=health' }, response)
    await response.finished

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true, database: 'ready' })
  })
})
