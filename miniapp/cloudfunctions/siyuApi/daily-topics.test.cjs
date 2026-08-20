const { strict: assert } = require('node:assert')
const test = require('node:test')
const { dailyTopicDrafts } = require('./daily-topics.cjs')

test('returns three stable topics for one Shanghai calendar day', () => {
  const morning = dailyTopicDrafts(new Date('2026-08-20T00:05:00+08:00'))
  const evening = dailyTopicDrafts(new Date('2026-08-20T23:55:00+08:00'))

  assert.equal(morning.length, 3)
  assert.deepEqual(morning.map(item => item.id), evening.map(item => item.id))
  assert.equal(new Set(morning.map(item => item.title)).size, 3)
})

test('uses different IDs on the following Shanghai calendar day', () => {
  const first = dailyTopicDrafts(new Date('2026-08-20T12:00:00+08:00'))
  const next = dailyTopicDrafts(new Date('2026-08-21T12:00:00+08:00'))

  assert.notDeepEqual(first.map(item => item.id), next.map(item => item.id))
})
