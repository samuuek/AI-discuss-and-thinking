const { strict: assert } = require('node:assert')
const test = require('node:test')
const { createWebApiService } = require('./web-api-service.cjs')

function createFixture(responseBody) {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init })
    return { ok: true, status: 200, async json() { return responseBody } }
  }
  return {
    calls,
    service: createWebApiService({
      baseUrl: 'https://example.vercel.app/',
      accessToken: 'private-test-token',
      fetcher,
    }),
  }
}

test('health verifies that the protected shared web service is reachable', async () => {
  const fixture = createFixture({ models: [] })

  assert.deepEqual(await fixture.service.execute('health'), { ok: true })
  assert.equal(fixture.calls[0].url, 'https://example.vercel.app/api/models')
  assert.equal(fixture.calls[0].init.headers.Authorization, 'Bearer private-test-token')
})

test('creates daily and private topics through the shared web database', async () => {
  const daily = createFixture({ topics: [{ id: 'daily-1', title: '今日同步议题' }] })
  const created = createFixture({ topic: { id: 'topic-1', title: '私人同步议题' } })

  await assert.doesNotReject(async () => {
    assert.deepEqual(await daily.service.execute('ensureDailyTopics'), [{ id: 'daily-1', title: '今日同步议题' }])
    assert.deepEqual(await created.service.execute('createTopic', { title: '私人同步议题' }), { id: 'topic-1', title: '私人同步议题' })
  })
  assert.equal(daily.calls[0].url, 'https://example.vercel.app/api/topics/daily')
  assert.equal(daily.calls[0].init.method, 'POST')
  assert.equal(created.calls[0].url, 'https://example.vercel.app/api/topics')
  assert.equal(created.calls[0].init.method, 'POST')
  assert.equal(created.calls[0].init.body, JSON.stringify({ title: '私人同步议题' }))
})

test('reads and updates the same topic workspace used by the web app', async () => {
  const loaded = createFixture({ workspace: { topicId: 'topic/1', note: '已有笔记', messages: [] } })
  const updated = createFixture({ workspace: { topicId: 'topic/1', note: '手机更新', messages: [] } })
  const messaged = createFixture({ message: { id: 'message-1', role: 'user', content: '同步消息' } })

  assert.equal((await loaded.service.execute('fetchWorkspace', { topicId: 'topic/1' })).note, '已有笔记')
  assert.equal((await updated.service.execute('updateWorkspace', { topicId: 'topic/1', patch: { note: '手机更新' } })).note, '手机更新')
  assert.equal((await messaged.service.execute('addMessage', { topicId: 'topic/1', message: { role: 'user', content: '同步消息' } })).id, 'message-1')
  assert.equal(loaded.calls[0].url, 'https://example.vercel.app/api/workspaces/topic%2F1')
  assert.equal(updated.calls[0].init.method, 'PATCH')
  assert.equal(updated.calls[0].init.body, JSON.stringify({ note: '手机更新' }))
  assert.equal(messaged.calls[0].url, 'https://example.vercel.app/api/workspaces/topic%2F1/messages')
  assert.equal(messaged.calls[0].init.method, 'POST')
})

test('shares weekly refreshes and saved analyses with the web app', async () => {
  const snapshot = { items: [{ id: 'weekly-1' }], sources: [], analyses: [], stale: false }
  const loaded = createFixture(snapshot)
  const refreshed = createFixture(snapshot)
  const saved = createFixture({ analysis: { analystId: 'weekly-translation', fingerprint: 'v1', markdown: '中文周报' } })

  assert.deepEqual(await loaded.service.execute('fetchWeekly'), snapshot)
  assert.deepEqual(await refreshed.service.execute('refreshWeekly'), snapshot)
  assert.equal((await saved.service.execute('saveWeeklyAnalysis', { analystId: 'weekly-translation', fingerprint: 'v1', markdown: '中文周报' })).markdown, '中文周报')
  assert.equal(loaded.calls[0].url, 'https://example.vercel.app/api/weekly')
  assert.equal(refreshed.calls[0].init.method, 'POST')
  assert.equal(saved.calls[0].url, 'https://example.vercel.app/api/weekly/analyses')
  assert.equal(saved.calls[0].init.method, 'POST')
})

test('returns the Chinese server error without exposing the private token', async () => {
  const service = createWebApiService({
    baseUrl: 'https://example.vercel.app',
    accessToken: 'private-test-token',
    fetcher: async () => ({ ok: false, status: 503, async json() { return { error: '数据库暂时不可用' } } }),
  })

  await assert.rejects(service.execute('fetchTopics'), error => {
    assert.match(error.message, /数据库暂时不可用/)
    assert.doesNotMatch(error.message, /private-test-token/)
    return true
  })
})
