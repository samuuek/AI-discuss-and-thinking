const { strict: assert } = require('node:assert')
const test = require('node:test')
const { createWeeklyRefresher } = require('./weekly-refresh.cjs')

test('keeps prior items for a failed source and replaces a successful source', async () => {
  const sources = [{ id: 'good' }, { id: 'failed' }]
  const refresh = createWeeklyRefresher({
    sources,
    fetchSource: async source => {
      if (source.id === 'failed') throw new Error('暂时不可用')
      return [{ id: 'new-good', sourceId: 'good', publishedAt: '2026-08-20T00:00:00Z' }]
    },
  })
  const previous = {
    items: [
      { id: 'old-good', sourceId: 'good', publishedAt: '2026-08-19T00:00:00Z' },
      { id: 'old-failed', sourceId: 'failed', publishedAt: '2026-08-19T00:00:00Z' },
    ],
    sources: [],
  }

  const snapshot = await refresh(previous, new Date('2026-08-20T01:00:00Z'))

  assert.deepEqual(snapshot.items.map(item => item.id), ['new-good', 'old-failed'])
  assert.equal(snapshot.sources.find(item => item.id === 'failed').error, '暂时不可用')
  assert.equal(snapshot.stale, false)
})

test('starts all official source requests together to stay within the cloud timeout', async () => {
  const started = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const refresh = createWeeklyRefresher({
    sources: [{ id: 'one' }, { id: 'two' }],
    fetchSource: async source => {
      started.push(source.id)
      await gate
      return []
    },
  })

  const pending = refresh({ items: [], sources: [] }, new Date('2026-08-20T01:00:00Z'))
  await Promise.resolve()

  assert.deepEqual(started, ['one', 'two'])
  release()
  await pending
})
