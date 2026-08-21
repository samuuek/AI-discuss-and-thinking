const { strict: assert } = require('node:assert')
const test = require('node:test')
const { fetchWeeklySource, normalizeWeeklyItems } = require('./weekly-sources.cjs')

const source = {
  id: 'openai',
  organization: 'OpenAI',
  url: 'https://openai.com/news/rss.xml',
  allowedHosts: ['openai.com'],
  category: '产品',
}

test('keeps recent official items and removes tracking duplicates', () => {
  const items = normalizeWeeklyItems(source, [
    { title: '新模型', url: 'https://openai.com/index/new/?utm_source=test', publishedAt: '2026-08-19T00:00:00Z', summary: '摘要' },
    { title: '重复', url: 'https://openai.com/index/new/', publishedAt: '2026-08-19T00:00:00Z', summary: '重复摘要' },
    { title: '过期', url: 'https://openai.com/index/old/', publishedAt: '2026-08-01T00:00:00Z', summary: '' },
  ], new Date('2026-08-20T00:00:00Z'))

  assert.equal(items.length, 1)
  assert.equal(items[0].url, 'https://openai.com/index/new/')
})

test('parses an official RSS item', async () => {
  const body = '<rss><channel><item><title>模型更新</title><link>https://openai.com/index/model-update/</link><pubDate>Wed, 19 Aug 2026 00:00:00 GMT</pubDate><description>官方摘要</description></item></channel></rss>'
  const items = await fetchWeeklySource(source, {
    now: new Date('2026-08-20T00:00:00Z'),
    fetcher: async () => ({ ok: true, url: source.url, status: 200, headers: { get: () => null }, text: async () => body }),
  })

  assert.equal(items[0].title, '模型更新')
  assert.equal(items[0].summary, '官方摘要')
})

test('rejects a redirect outside the official host allowlist', async () => {
  await assert.rejects(fetchWeeklySource(source, {
    fetcher: async () => ({ ok: true, url: 'https://example.com/feed', status: 200, headers: { get: () => null }, text: async () => '<rss></rss>' }),
  }), /来源域名不受信任/)
})
