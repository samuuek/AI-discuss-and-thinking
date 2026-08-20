const { strict: assert } = require('node:assert')
const test = require('node:test')
const { createProductionHandler } = require('./production.cjs')

function createFakeDatabase() {
  const docs = new Map()
  return {
    collection() {
      return {
        doc(id) {
          return {
            async get() { return { data: docs.get(id) || null } },
            async set({ data }) { docs.set(id, { _id: id, ...data }) },
          }
        },
        async add({ data }) { docs.set(data._id, data) },
        where() { return { limit() { return { async get() { return { data: [] } } } } } },
      }
    },
  }
}

test('initializes the current WeChat environment and serves health', async () => {
  const initialized = []
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'dynamic-current-env',
    init(options) { initialized.push(options) },
    database: () => createFakeDatabase(),
    getWXContext: () => ({ OPENID: 'owner-openid' }),
  }
  const handler = createProductionHandler({
    cloud,
    fetcher: async () => ({ ok: true, status: 200, async json() { return { models: [] } } }),
    env: {
      SIYU_WEB_API_BASE_URL: 'https://example.vercel.app',
      SIYU_PRIVATE_ACCESS_TOKEN: 'private-test-token',
    },
  })

  const result = await handler({ action: 'health' })

  assert.deepEqual(initialized, [{ env: 'dynamic-current-env' }])
  assert.deepEqual(result, { ok: true, data: { ok: true } })
})

test('refuses to start when shared web synchronization is not configured', () => {
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'dynamic-current-env',
    init() {},
    database: () => createFakeDatabase(),
    getWXContext: () => ({ OPENID: 'owner-openid' }),
  }

  assert.throws(
    () => createProductionHandler({ cloud, fetcher: async () => {}, env: {} }),
    /网页同步服务/,
  )
})

test('reads the same web topics through the authenticated Vercel API', async () => {
  const requests = []
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'dynamic-current-env',
    init() {},
    database: () => createFakeDatabase(),
    getWXContext: () => ({ OPENID: 'owner-openid' }),
  }
  const fetcher = async (url, init = {}) => {
    requests.push({ url, init })
    return {
      ok: true,
      status: 200,
      async json() { return { topics: [{ id: 'shared-topic', title: '网页与小程序同步' }] } },
    }
  }
  const handler = createProductionHandler({
    cloud,
    fetcher,
    env: {
      SIYU_WEB_API_BASE_URL: 'https://example.vercel.app',
      SIYU_PRIVATE_ACCESS_TOKEN: 'private-test-token',
    },
  })

  const result = await handler({ action: 'fetchTopics' })

  assert.deepEqual(result, { ok: true, data: [{ id: 'shared-topic', title: '网页与小程序同步' }] })
  assert.equal(requests[0].url, 'https://example.vercel.app/api/topics')
  assert.equal(requests[0].init.headers.Authorization, 'Bearer private-test-token')
})
