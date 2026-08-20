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
  const handler = createProductionHandler({ cloud, fetcher: async () => { throw new Error('not used') } })

  const result = await handler({ action: 'health' })

  assert.deepEqual(initialized, [{ env: 'dynamic-current-env' }])
  assert.deepEqual(result, { ok: true, data: { ok: true } })
})
