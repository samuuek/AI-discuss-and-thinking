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
    this.credentials = new Map()
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
    this.credentials = draft.credentials
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
    draft.credentials = copy(this.credentials)
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
      const row = current ? { ...current, updated_at } : { id, kind, title, summary, reason, source, color, status, created_at, updated_at }
      for (const [index, key] of ['kind', 'title', 'summary', 'reason', 'source', 'color', 'status'].entries()) {
        if (current && values[10 + index * 2]) row[key] = values[11 + index * 2]
      }
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
    if (operation === 'credential:get') return this.credentials.has(values[0]) ? [this.credentials.get(values[0])] : []
    if (operation === 'credential:save') {
      const [provider, status, ciphertext, iv, auth_tag, key_version, provider_model_id, updated_at] = values
      const row = { provider, status, ciphertext, iv, auth_tag, key_version, provider_model_id, updated_at }
      this.credentials.set(provider, row)
      return [row]
    }
    if (operation === 'credential:disable') {
      const [provider, status, updated_at] = values
      const row = { provider, status, ciphertext: null, iv: null, auth_tag: null, key_version: null, provider_model_id: null, updated_at }
      this.credentials.set(provider, row)
      return [row]
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

  test('upserts and disables encrypted model credentials with parameterized values', async () => {
    const saved = await store.saveModelCredential({
      provider: 'deepseek',
      status: 'ready',
      ciphertext: 'synthetic-ciphertext',
      iv: 'synthetic-iv',
      authTag: 'synthetic-tag',
      keyVersion: 1,
      providerModelId: 'deepseek-v4-flash',
      updatedAt: '2026-08-21T10:00:00.000Z',
    })

    await expect(store.getModelCredential('deepseek')).resolves.toEqual(saved)
    expect(adapter.calls.find(call => call.text.includes('credential:save'))?.values).toEqual([
      'deepseek',
      'ready',
      'synthetic-ciphertext',
      'synthetic-iv',
      'synthetic-tag',
      1,
      'deepseek-v4-flash',
      '2026-08-21T10:00:00.000Z',
    ])

    await expect(store.disableModelCredential('deepseek', '2026-08-21T11:00:00.000Z')).resolves.toMatchObject({
      provider: 'deepseek',
      status: 'disabled',
      ciphertext: null,
      authTag: null,
      providerModelId: null,
    })
  })

  test('normalizes timestamp values returned as driver Date objects', async () => {
    const topic = {
      id: 'date-topic', kind: '热点', title: '驱动时间类型', summary: '', reason: '', source: '', color: 'blue', status: '讨论中',
      created_at: new Date('2026-08-16T01:02:03.000Z'), updated_at: new Date('2026-08-16T04:05:06.000Z'),
    }
    const workspace = {
      topic_id: 'date-topic', note: '', reflection: '', resources: '', summary: '', mind_map: '', selected_model: 'siyu-demo',
      updated_at: new Date('2026-08-16T07:08:09.000Z'),
    }
    const message = {
      id: 'date-message', role: 'assistant', content: '时间应为 ISO 字符串', model_id: null,
      created_at: new Date('2026-08-16T10:11:12.000Z'),
    }
    const weeklyItem = {
      id: 'date-item', source_id: 'openai', organization: 'OpenAI', title: '日期驱动行', url: 'https://openai.com/date',
      published_at: new Date('2026-08-16T13:14:15.000Z'), category: '产品', summary: '', significance: '',
    }
    const dateDriver = () => { throw new Error('tagged queries are not used by this test') }
    dateDriver.query = async text => {
      const operation = text.match(/\/\*\s*([\w:-]+)\s*\*\//)?.[1]
      if (operation === 'topic:list' || operation === 'topic:get') return [topic]
      if (operation === 'workspace:ensure') return []
      if (operation === 'workspace:get') return [workspace]
      if (operation === 'message:list') return [message]
      if (operation === 'weekly:item:list') return [weeklyItem]
      if (operation === 'weekly:source:list') return [
        { source_id: 'december', last_success_at: new Date('2026-12-01T00:00:00.000Z'), last_attempt_at: new Date('2026-12-01T01:00:00.000Z'), error: null },
        { source_id: 'may', last_success_at: new Date('2026-05-01T00:00:00.000Z'), last_attempt_at: new Date('2026-05-01T01:00:00.000Z'), error: null },
      ]
      if (operation === 'analysis:list') return [{ analyst_id: 'deepseek-web', fingerprint: 'date-v1', markdown: '日期分析', updated_at: new Date('2026-08-16T16:17:18.000Z') }]
      throw new Error(`Unsupported date driver query: ${operation}`)
    }
    dateDriver.transaction = async () => []
    const dateStore = createPostgresStore(dateDriver)

    const [returnedTopic, returnedWorkspace, snapshot, backup, analyses] = await Promise.all([
      dateStore.getTopic('date-topic'),
      dateStore.getWorkspace('date-topic'),
      dateStore.getWeeklySnapshot(new Date('2026-12-31T00:00:00.000Z')),
      dateStore.exportBackup(),
      dateStore.listWeeklyAnalyses(),
    ])

    expect(returnedTopic).toMatchObject({ createdAt: '2026-08-16T01:02:03.000Z', updatedAt: '2026-08-16T04:05:06.000Z' })
    expect(returnedWorkspace).toMatchObject({
      updatedAt: '2026-08-16T07:08:09.000Z',
      messages: [expect.objectContaining({ createdAt: '2026-08-16T10:11:12.000Z' })],
    })
    expect(snapshot).toMatchObject({
      items: [expect.objectContaining({ publishedAt: '2026-08-16T13:14:15.000Z' })],
      sources: [
        expect.objectContaining({ lastSuccessAt: '2026-12-01T00:00:00.000Z', lastAttemptAt: '2026-12-01T01:00:00.000Z', error: undefined }),
        expect.objectContaining({ lastSuccessAt: '2026-05-01T00:00:00.000Z', lastAttemptAt: '2026-05-01T01:00:00.000Z', error: undefined }),
      ],
      updatedAt: '2026-12-01T00:00:00.000Z',
    })
    expect(backup.topics[0]).toMatchObject({ createdAt: '2026-08-16T01:02:03.000Z', updatedAt: '2026-08-16T04:05:06.000Z' })
    expect(backup.topics[0].workspace).toMatchObject({ updatedAt: '2026-08-16T07:08:09.000Z' })
    expect(analyses).toEqual([{ analystId: 'deepseek-web', fingerprint: 'date-v1', markdown: '日期分析', updatedAt: '2026-08-16T16:17:18.000Z' }])
  })

  test('restores a partial topic without replacing omitted existing fields', async () => {
    const original = await store.createTopic({
      id: 'partial-topic',
      kind: '热点',
      title: '原始标题',
      summary: '原始摘要',
      reason: '原始原因',
      source: '原始来源',
      color: 'blue',
      status: '已沉淀',
    })

    await store.restoreBackup({ version: 1, topics: [{ id: 'partial-topic', title: '恢复后的标题' }] })

    await expect(store.getTopic('partial-topic')).resolves.toMatchObject({
      id: 'partial-topic',
      kind: '热点',
      title: '恢复后的标题',
      summary: '原始摘要',
      reason: '原始原因',
      source: '原始来源',
      color: 'blue',
      status: '已沉淀',
      createdAt: original.createdAt,
    })
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
