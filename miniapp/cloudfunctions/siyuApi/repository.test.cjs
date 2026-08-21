const { strict: assert } = require('node:assert')
const test = require('node:test')
const { createCloudRepository } = require('./repository.cjs')

function createFakeDatabase() {
  const docs = new Map()
  const collection = () => ({
    doc(id) {
      return {
        async get() { return { data: structuredClone(docs.get(id) || null) } },
        async set({ data }) { docs.set(id, { _id: id, ...structuredClone(data) }); return { stats: { created: 1 } } },
      }
    },
    async add({ data }) {
      if (docs.has(data._id)) throw new Error('document exists')
      docs.set(data._id, structuredClone(data))
      return { _id: data._id }
    },
    where(condition) {
      return {
        limit() {
          return {
            async get() {
              return { data: [...docs.values()].filter(item => Object.entries(condition).every(([key, value]) => item[key] === value)).map(item => structuredClone(item)) }
            },
          }
        },
      }
    },
  })
  return { collection }
}

test('locks the cloud data to the first WeChat account', async () => {
  const database = createFakeDatabase()
  const first = createCloudRepository(database, { now: () => new Date('2026-08-20T00:00:00Z') })
  const second = createCloudRepository(database, { now: () => new Date('2026-08-20T00:01:00Z') })

  await first.ensureOwner('owner-openid')
  await second.ensureOwner('owner-openid')
  await assert.rejects(second.ensureOwner('another-openid'), /此微信账号无权访问思屿/)
})

test('persists and sorts topics without exposing repository metadata', async () => {
  const repository = createCloudRepository(createFakeDatabase())
  await repository.putTopic({ id: 'older', title: '较早', updatedAt: '2026-08-19T00:00:00Z' })
  await repository.putTopic({ id: 'newer', title: '较新', updatedAt: '2026-08-20T00:00:00Z' })

  const topics = await repository.listTopics()

  assert.deepEqual(topics.map(item => item.id), ['newer', 'older'])
  assert.equal('_id' in topics[0], false)
  assert.equal('type' in topics[0], false)
})
