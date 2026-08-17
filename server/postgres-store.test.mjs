// @vitest-environment node
import { beforeEach, describe, expect, test } from 'vitest'
import { createPostgresStore } from './postgres-store.mjs'

class DeterministicQueryAdapter {
  constructor() {
    this.calls = []
    this.topics = new Map()
    this.workspaces = new Map()
    this.messages = new Map()
    this.analyses = new Map()
    this.sequence = 0
  }

  async query(text, values = []) {
    this.calls.push({ text, values })
    const operation = text.match(/\/\*\s*([\w:-]+)\s*\*\//)?.[1]

    if (!operation || operation === 'schema') return []

    if (operation === 'topic:create') {
      const [id, kind, title, summary, reason, source, color, status, created_at, updated_at] = values
      const row = { id, kind, title, summary, reason, source, color, status, created_at, updated_at }
      this.topics.set(id, row)
      return [row]
    }
    if (operation === 'topic:get') return this.topics.has(values[0]) ? [this.topics.get(values[0])] : []
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
    if (operation === 'analysis:upsert') {
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
    store = createPostgresStore(adapter)
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
})
