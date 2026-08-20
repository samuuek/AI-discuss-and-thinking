const { randomUUID } = require('node:crypto')
const { dailyTopicDrafts } = require('./daily-topics.cjs')

function cleanText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function createSiyuService({ repository, now = () => new Date(), randomId = randomUUID }) {
  if (!repository) throw new TypeError('缺少云数据库仓库')

  return {
    async execute(action, payload = {}) {
      if (action === 'health') return { ok: true }
      if (action === 'fetchTopics') return repository.listTopics()

      if (action === 'ensureDailyTopics') {
        const topics = []
        for (const draft of dailyTopicDrafts(now())) {
          const existing = await repository.getTopic(draft.id)
          if (existing) {
            topics.push(existing)
            continue
          }
          const timestamp = now().toISOString()
          const topic = { ...draft, createdAt: timestamp, updatedAt: timestamp }
          await repository.putTopic(topic)
          await repository.putWorkspace(emptyWorkspace(topic.id, timestamp))
          topics.push(topic)
        }
        return topics
      }

      if (action === 'createTopic') {
        const title = cleanText(payload.title)
        if (!title) throw new Error('议题标题不能为空')
        const timestamp = now().toISOString()
        const topic = {
          id: cleanText(payload.id) || randomId(),
          kind: cleanText(payload.kind, '私人议题'),
          title,
          summary: cleanText(payload.summary),
          reason: cleanText(payload.reason, '你创建的议题'),
          source: cleanText(payload.source, '思屿'),
          color: cleanText(payload.color, 'green'),
          status: cleanText(payload.status, '讨论中'),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await repository.putTopic(topic)
        await repository.putWorkspace(emptyWorkspace(topic.id, timestamp))
        return topic
      }

      if (action === 'fetchWorkspace') {
        const topicId = cleanText(payload.topicId)
        if (!topicId || !await repository.getTopic(topicId)) throw new Error('思考空间不存在')
        const existing = await repository.getWorkspace(topicId)
        if (existing) return existing
        return repository.putWorkspace(emptyWorkspace(topicId, now().toISOString()))
      }

      if (action === 'updateWorkspace') {
        const current = await this.execute('fetchWorkspace', { topicId: payload.topicId })
        const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : {}
        const allowed = new Set(['note', 'reflection', 'resources', 'summary', 'mindMap', 'selectedModel'])
        for (const [key, value] of Object.entries(patch)) {
          if (!allowed.has(key)) throw new Error(`不支持字段：${key}`)
          if (typeof value !== 'string') throw new Error(`${key} 必须是文本`)
        }
        return repository.putWorkspace({ ...current, ...patch, updatedAt: now().toISOString() })
      }

      if (action === 'addMessage') {
        const current = await this.execute('fetchWorkspace', { topicId: payload.topicId })
        const input = payload.message && typeof payload.message === 'object' ? payload.message : {}
        if (!['user', 'assistant', 'system'].includes(input.role) || !cleanText(input.content)) throw new Error('消息内容无效')
        const message = {
          id: cleanText(input.id) || randomId(),
          role: input.role,
          content: cleanText(input.content),
          ...(cleanText(input.modelId) ? { modelId: cleanText(input.modelId) } : {}),
          createdAt: cleanText(input.createdAt) || now().toISOString(),
        }
        const existing = current.messages.find(item => item.id === message.id)
        if (existing) return existing
        await repository.putWorkspace({
          ...current,
          messages: [...current.messages, message],
          updatedAt: message.createdAt,
        })
        return message
      }

      if (action === 'fetchWeekly') {
        return await repository.getWeekly() || emptyWeekly()
      }

      if (action === 'saveWeeklyAnalysis') {
        const analystId = cleanText(payload.analystId)
        const fingerprint = cleanText(payload.fingerprint)
        const markdown = cleanText(payload.markdown)
        if (!analystId || !fingerprint || !markdown) throw new Error('分析内容无效')
        const snapshot = await repository.getWeekly() || emptyWeekly()
        const analysis = { analystId, fingerprint, markdown, updatedAt: now().toISOString() }
        const analyses = snapshot.analyses.filter(item => !(item.analystId === analystId && item.fingerprint === fingerprint))
        await repository.putWeekly({ ...snapshot, analyses: [analysis, ...analyses] })
        return analysis
      }

      throw new Error('不支持的云端操作')
    },
  }
}

function emptyWorkspace(topicId, timestamp) {
  return {
    topicId,
    note: '',
    reflection: '',
    resources: '',
    summary: '',
    mindMap: '',
    selectedModel: 'deepseek-web',
    updatedAt: timestamp,
    messages: [],
  }
}

function emptyWeekly() {
  return { items: [], sources: [], stale: true, analyses: [] }
}

module.exports = { createSiyuService }
