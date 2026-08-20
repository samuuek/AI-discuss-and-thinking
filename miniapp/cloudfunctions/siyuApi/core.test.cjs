const { strict: assert } = require('node:assert')
const test = require('node:test')
const { createSiyuService } = require('./core.cjs')

function createMemoryRepository() {
  const topics = new Map()
  const workspaces = new Map()
  let weekly = null
  return {
    async listTopics() { return [...topics.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) },
    async getTopic(id) { return topics.get(id) || null },
    async putTopic(topic) { topics.set(topic.id, structuredClone(topic)); return structuredClone(topic) },
    async getWorkspace(topicId) { return structuredClone(workspaces.get(topicId) || null) },
    async putWorkspace(workspace) { workspaces.set(workspace.topicId, structuredClone(workspace)); return structuredClone(workspace) },
    async getWeekly() { return structuredClone(weekly) },
    async putWeekly(value) { weekly = structuredClone(value); return structuredClone(value) },
  }
}

const fixedNow = () => new Date('2026-08-20T09:00:00+08:00')

test('creates a topic and returns it after a new service instance', async () => {
  const repository = createMemoryRepository()
  const first = createSiyuService({ repository, now: fixedNow, randomId: () => 'topic-1' })
  await first.execute('createTopic', { title: '新的思考' })

  const second = createSiyuService({ repository, now: fixedNow, randomId: () => 'unused' })
  const topics = await second.execute('fetchTopics')

  assert.deepEqual(topics.map(item => item.id), ['topic-1'])
  assert.equal(topics[0].title, '新的思考')
})

test('persists workspace fields and messages for a topic', async () => {
  const repository = createMemoryRepository()
  const service = createSiyuService({ repository, now: fixedNow, randomId: () => 'fixed-id' })
  await service.execute('createTopic', { id: 'topic-a', title: '保存后的议题' })

  await service.execute('updateWorkspace', { topicId: 'topic-a', patch: { note: '私人旁注' } })
  await service.execute('addMessage', { topicId: 'topic-a', message: { role: 'user', content: '先写下问题' } })
  const workspace = await service.execute('fetchWorkspace', { topicId: 'topic-a' })

  assert.equal(workspace.note, '私人旁注')
  assert.deepEqual(workspace.messages.map(item => ({ role: item.role, content: item.content })), [
    { role: 'user', content: '先写下问题' },
  ])
})

test('creates the three daily topics only once', async () => {
  const repository = createMemoryRepository()
  const service = createSiyuService({ repository, now: fixedNow, randomId: () => 'unused' })

  const first = await service.execute('ensureDailyTopics')
  const second = await service.execute('ensureDailyTopics')

  assert.equal(first.length, 3)
  assert.deepEqual(first.map(item => item.id), second.map(item => item.id))
  assert.equal((await repository.listTopics()).length, 3)
})

test('saves a weekly translation without discarding weekly items', async () => {
  const repository = createMemoryRepository()
  await repository.putWeekly({
    items: [{ id: 'news-1', title: 'Model update' }],
    sources: [],
    stale: false,
    analyses: [],
  })
  const service = createSiyuService({ repository, now: fixedNow, randomId: () => 'unused' })

  await service.execute('saveWeeklyAnalysis', {
    analystId: 'weekly-translation',
    fingerprint: 'news-1',
    markdown: '[{"id":"news-1","title":"模型更新","summary":"摘要"}]',
  })
  const snapshot = await service.execute('fetchWeekly')

  assert.equal(snapshot.items[0].id, 'news-1')
  assert.equal(snapshot.analyses[0].analystId, 'weekly-translation')
})
