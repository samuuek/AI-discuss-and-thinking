// @vitest-environment node
import { beforeEach, describe, expect, test } from 'vitest'
import { createPostgresStore } from './postgres-store.mjs'

class DeterministicQueryAdapter {
  constructor() {
    this.calls = []
    this.topics = new Map()
    this.workspaces = new Map()
    this.messages = new Map()
    this.weeklyItems = new Map()
    this.weeklySources = new Map()
    this.analyses = new Map()
    this.sequence = 0
    this.failure = null

    const sql = (strings, ...values) => ({ text: strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, ''), values })
    sql.query = (text, values) => this.query(text, values)
    sql.transaction = queriesOrFactory => this.transaction(queriesOrFactory)
    this.sql = sql
  }

  async query(text, values = []) {
    this.calls.push({ text, values })
    return this.execute(text, values)
  }

  async transaction(queriesOrFactory) {
    const statements = typeof queriesOrFactory === 'function' ? queriesOrFactory(this.sql) : queriesOrFactory
    if (!Array.isArray(statements)) throw new Error('Transaction factory must return an array')
    const draft = this.clone()
    const results = []
    for (const statement of statements) {
      this.calls.push({ ...statement, transaction: true })
      results.push(await draft.execute(statement.text, statement.values))
    }
    this.topics = draft.topics
    this.workspaces = draft.workspaces
    this.messages = draft.messages
    this.weeklyItems = draft.weeklyItems
    this.weeklySources = draft.weeklySources
    this.analyses = draft.analyses
    this.sequence = draft.sequence
    return results
  }

  clone() {
    const draft = new DeterministicQueryAdapter()
    const copy = map => new Map([...map].map(([key, value]) => [key, { ...value }]))
    draft.topics = copy(this.topics)
    draft.workspaces = copy(this.workspaces)
    draft.messages = copy(this.messages)
    draft.weeklyItems = copy(this.weeklyItems)
    draft.weeklySources = copy(this.weeklySources)
    draft.analyses = copy(this.analyses)
    draft.sequence = this.sequence
    draft.failure = this.failure
    return draft
  }

  async execute(text, values = []) {
    const operation = text.match(/\/\*\s*([\w:-]+)\s*\*\//)?.[1]

    if (!operation || operation === 'schema') return []
    if (this.failure?.({ operation, values })) throw new Error('injected query failure')

    if (operation === 'topic:create') {
      const [id, kind, title, summary, reason, source, color, status, created_at, updated_at] = values
      const row = { id, kind, title, summary, reason, source, color, status, created_at, updated_at }
      this.topics.set(id, row)
      return [row]
    }
    if (operation === 'topic:get') return this.topics.has(values[0]) ? [this.topics.get(values[0])] : []
    if (operation === 'topic:update') {
      const [kind, title, summary, reason, source, color, status, updated_at, id] = values
      const current = this.topics.get(id)
      if (!current) return []
      const row = { ...current, kind, title, summary, reason, source, color, status, updated_at }
      this.topics.set(id, row)
      return [row]
    }
    if (operation === 'topic:restore') {
      const [id, kind, title, summary, reason, source, color, status, created_at, updated_at] = values
      const current = this.topics.get(id)
      const row = { id, kind, title, summary, reason, source, color, status, created_at: current?.created_at || created_at, updated_at }
      this.topics.set(id, row)
      return [row]
    }
    if (operation === 'topic:touch') {
      const [updated_at, id] = values
      const current = this.topics.get(id)
      if (!current) return []
      const row = { ...current, updated_at }
      this.topics.set(id, row)
      return [row]
    }
    if (operation === 'workspace:ensure') {
      const [topic_id, updated_at] = values
      if (!this.topics.has(topic_id)) return []
      if (!this.workspaces.has(topic_id)) {
        this.workspaces.set(topic_id, { topic_id, note: '', reflection: '', resources: '', summary: '', mind_map: '', selected_model: 'siyu-demo', updated_at })
      }
      return [this.workspaces.get(topic_id)]
    }
    if (operation === 'workspace:get') return this.workspaces.has(values[0]) ? [this.workspaces.get(values[0])] : []
    if (operation === 'workspace:update') {
      const [note, reflection, resources, summary, mind_map, selected_model, updated_at, topic_id] = values
      if (!this.workspaces.has(topic_id)) return []
      const row = { topic_id, note, reflection, resources, summary, mind_map, selected_model, updated_at }
      this.workspaces.set(topic_id, row)
      return [row]
    }
    if (operation === 'workspace:restore') {
      const [topic_id, note, reflection, resources, summary, mind_map, selected_model, updated_at] = values
      const row = { topic_id, note, reflection, resources, summary, mind_map, selected_model, updated_at }
      this.workspaces.set(topic_id, row)
      return [row]
    }
    if (operation === 'message:get') return this.messages.has(values[0]) ? [this.messages.get(values[0])] : []
    if (operation === 'message:create') {
      const [id, topic_id, role, content, model_id, created_at] = values
      if (this.messages.has(id)) return []
      const row = { sequence: ++this.sequence, id, topic_id, role, content, model_id, created_at }
      this.messages.set(id, row)
      return [row]
    }
    if (operation === 'message:list') {
      return [...this.messages.values()].filter(row => row.topic_id === values[0]).sort((a, b) => a.sequence - b.sequence)
    }
    if (operation === 'weekly:delete') {
      for (const [id, row] of this.weeklyItems) if (row.source_id === values[0]) this.weeklyItems.delete(id)
      return []
    }
    if (operation === 'weekly:item:create') {
      const [id, source_id, organization, title, url, published_at, category, summary, significance] = values
      if (this.weeklyItems.has(id)) throw new Error('duplicate weekly item')
      const row = { id, source_id, organization, title, url, published_at, category, summary, significance }
      this.weeklyItems.set(id, row)
      return [row]
    }
    if (operation === 'weekly:source-success') {
      const [source_id, last_success_at, last_attempt_at] = values
      const row = { source_id, last_success_at, last_attempt_at, error: null }
      this.weeklySources.set(source_id, row)
      return [row]
    }
    if (operation === 'weekly:item:list') {
      const [cutoff, reference] = values
      return [...this.weeklyItems.values()].filter(row => row.published_at >= cutoff && row.published_at <= reference).sort((a, b) => b.published_at.localeCompare(a.published_at))
    }
    if (operation === 'weekly:source:list') return [...this.weeklySources.values()].sort((a, b) => a.source_id.localeCompare(b.source_id))
    if (operation === 'analysis:upsert') {
      const normalized = text.replace(/\s+/g, ' ').trim().toUpperCase()
      const validUpsert = '/* ANALYSIS:UPSERT */ INSERT INTO WEEKLY_ANALYSES (ANALYST_ID, FINGERPRINT, MARKDOWN, UPDATED_AT) VALUES ($1, $2, $3, $4) ON CONFLICT (ANALYST_ID, FINGERPRINT) DO UPDATE SET MARKDOWN = EXCLUDED.MARKDOWN, UPDATED_AT = EXCLUDED.UPDATED_AT RETURNING *'
      if (normalized !== validUpsert) {
        throw new Error('invalid weekly analysis upsert SQL')
      }
      const [analyst_id, fingerprint, markdown, updated_at] = values
      const row = { analyst_id, fingerprint, markdown, updated_at }
      this.analyses.set(`${analyst_id}:${fingerprint}`, row)
      return [row]
    }
    if (operation === 'analysis:list') {
      return [...this.analyses.values()]
        .filter(row => values.length === 0 || row.fingerprint === values[0])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    }

    throw new Error(`Unsupported test query: ${operation}`)
  }
}

describe('Postgres store contract', () => {
  let adapter
  let store

  beforeEach(() => {
    adapter = new DeterministicQueryAdapter()
    store = createPostgresStore(adapter.sql)
  })

  test('creates a topic and its matching default workspace with parameterized values', async () => {
    const topic = await store.createTopic({ id: 'topic-1', title: "思考 ' 参数", kind: '为你推荐' })

    expect(topic).toMatchObject({
      id: 'topic-1',
      title: "思考 ' 参数",
      kind: '为你推荐',
      summary: '',
      reason: '你创建的议题',
      source: '私人议题',
      color: 'green',
      status: '讨论中',
    })
    await expect(store.getWorkspace(topic.id)).resolves.toMatchObject({
      topicId: 'topic-1',
      note: '',
      selectedModel: 'siyu-demo',
      messages: [],
    })
    expect(adapter.calls.some(call => call.values.includes("思考 ' 参数"))).toBe(true)
    expect(adapter.calls.every(call => !call.text.includes("思考 ' 参数"))).toBe(true)
  })

  test('persists workspace fields and returns the SQLite-compatible shape', async () => {
    await store.createTopic({ id: 'topic-2', title: '工作区' })

    await store.updateWorkspace('topic-2', {
      note: '私人笔记',
      reflection: '再想一步',
      resources: '资料',
      summary: '摘要',
      mindMap: 'root -> leaf',
      selectedModel: 'deepseek-chat',
    })

    await expect(store.getWorkspace('topic-2')).resolves.toMatchObject({
      topicId: 'topic-2',
      note: '私人笔记',
      reflection: '再想一步',
      resources: '资料',
      summary: '摘要',
      mindMap: 'root -> leaf',
      selectedModel: 'deepseek-chat',
      messages: [],
    })
  })

  test('returns the original message when the same message id is added twice', async () => {
    await store.createTopic({ id: 'topic-3', title: '消息' })

    const first = await store.addMessage('topic-3', { id: 'message-1', role: 'user', content: '第一次', createdAt: '2026-08-16T01:00:00.000Z' })
    const duplicate = await store.addMessage('topic-3', { id: 'message-1', role: 'user', content: '不应覆盖', createdAt: '2026-08-16T02:00:00.000Z' })

    expect(duplicate).toMatchObject({ id: first.id, role: 'user', content: '第一次', createdAt: first.createdAt })
    await expect(store.listMessages('topic-3')).resolves.toEqual([{
      id: 'message-1',
      role: 'user',
      content: '第一次',
      modelId: undefined,
      createdAt: '2026-08-16T01:00:00.000Z',
    }])
  })

  test('upserts weekly analysis by analyst and material fingerprint', async () => {
    await store.saveWeeklyAnalysis({ analystId: 'deepseek-web', fingerprint: 'v1', markdown: '旧分析', updatedAt: '2026-08-16T01:00:00.000Z' })

    const latest = await store.saveWeeklyAnalysis({ analystId: 'deepseek-web', fingerprint: 'v1', markdown: '新分析', updatedAt: '2026-08-16T02:00:00.000Z' })

    expect(latest).toEqual({ analystId: 'deepseek-web', fingerprint: 'v1', markdown: '新分析', updatedAt: '2026-08-16T02:00:00.000Z' })
    await expect(store.listWeeklyAnalyses('v1')).resolves.toEqual([latest])
  })

  test('rolls back weekly source replacement when an item insert fails', async () => {
    await store.replaceWeeklySource('openai', [{ id: 'old', organization: 'OpenAI', title: '旧条目', url: 'https://openai.com/old', publishedAt: '2026-08-15T00:00:00.000Z', category: '产品', summary: '', significance: '' }], '2026-08-16T00:00:00.000Z')
    adapter.failure = ({ operation, values }) => operation === 'weekly:item:create' && values[0] === 'bad'

    await expect(store.replaceWeeklySource('openai', [
      { id: 'new', organization: 'OpenAI', title: '新条目', url: 'https://openai.com/new', publishedAt: '2026-08-16T00:00:00.000Z', category: '产品', summary: '', significance: '' },
      { id: 'bad', organization: 'OpenAI', title: '损坏条目', url: 'https://openai.com/bad', publishedAt: '2026-08-16T01:00:00.000Z', category: '产品', summary: '', significance: '' },
    ], '2026-08-17T00:00:00.000Z')).rejects.toThrow('injected query failure')

    adapter.failure = null
    const snapshot = await store.getWeeklySnapshot(new Date('2026-08-17T01:00:00.000Z'))
    expect(snapshot.items.map(item => item.id)).toEqual(['old'])
    expect(snapshot.sources).toEqual([{ id: 'openai', lastSuccessAt: '2026-08-16T00:00:00.000Z', lastAttemptAt: '2026-08-16T00:00:00.000Z', error: undefined }])
  })

  test('rolls back every restored topic when a later restore query fails', async () => {
    await store.createTopic({ id: 'stable', title: '原始议题' })
    adapter.failure = ({ operation, values }) => ['topic:create', 'topic:restore'].includes(operation) && values[0] === 'bad-topic'

    await expect(store.restoreBackup({
      version: 1,
      topics: [
        { id: 'stable', title: '不应保留的更新' },
        { id: 'bad-topic', title: '触发失败' },
      ],
    })).rejects.toThrow('injected query failure')

    adapter.failure = null
    await expect(store.getTopic('stable')).resolves.toMatchObject({ title: '原始议题' })
    await expect(store.getTopic('bad-topic')).resolves.toBeNull()
  })
})
