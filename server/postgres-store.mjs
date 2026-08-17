import { randomUUID } from 'node:crypto'

const now = () => new Date().toISOString()
const cleanText = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback

function topicRow(row) {
  if (!row) return null
  return { id: row.id, kind: row.kind, title: row.title, summary: row.summary, reason: row.reason, source: row.source, color: row.color, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }
}

function messageRow(row) {
  return { id: row.id, role: row.role, content: row.content, modelId: row.model_id || undefined, createdAt: row.created_at }
}

function workspaceRow(row, messages) {
  if (!row) return null
  return { topicId: row.topic_id, note: row.note, reflection: row.reflection, resources: row.resources, summary: row.summary, mindMap: row.mind_map, selectedModel: row.selected_model, updatedAt: row.updated_at, messages }
}

function weeklyItemRow(row) {
  return { id: row.id, sourceId: row.source_id, organization: row.organization, title: row.title, url: row.url, publishedAt: row.published_at, category: row.category, summary: row.summary, significance: row.significance }
}

function weeklyAnalysisRow(row) {
  return { analystId: row.analyst_id, fingerprint: row.fingerprint, markdown: row.markdown, updatedAt: row.updated_at }
}

export function createPostgresStore(sql) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('需要有效的 Postgres 查询适配器')

  const query = async (operation, text, values = []) => {
    const result = await sql.query(`/* ${operation} */\n${text}`, values)
    return Array.isArray(result) ? result : result?.rows || []
  }

  const ensureWorkspace = (topicId, updatedAt) => query('workspace:ensure', `
    INSERT INTO workspaces (topic_id, updated_at)
    VALUES ($1, $2)
    ON CONFLICT (topic_id) DO NOTHING
    RETURNING *
  `, [topicId, updatedAt])

  const api = {
    async close() {},

    async listTopics({ query: search = '', status = '' } = {}) {
      let rows
      if (search && status && status !== '全部') {
        rows = await query('topic:list', `SELECT * FROM topics WHERE (title ILIKE $1 OR summary ILIKE $2) AND status = $3 ORDER BY updated_at DESC`, [`%${search}%`, `%${search}%`, status])
      } else if (search) {
        rows = await query('topic:list', `SELECT * FROM topics WHERE title ILIKE $1 OR summary ILIKE $2 ORDER BY updated_at DESC`, [`%${search}%`, `%${search}%`])
      } else if (status && status !== '全部') {
        rows = await query('topic:list', `SELECT * FROM topics WHERE status = $1 ORDER BY updated_at DESC`, [status])
      } else {
        rows = await query('topic:list', `SELECT * FROM topics ORDER BY updated_at DESC`)
      }
      return rows.map(topicRow)
    },

    async getTopic(id) {
      const rows = await query('topic:get', `SELECT * FROM topics WHERE id = $1`, [id])
      return topicRow(rows[0])
    },

    async createTopic(input) {
      const timestamp = now()
      const topic = {
        id: cleanText(input.id) || randomUUID(),
        kind: cleanText(input.kind, '为你推荐'),
        title: cleanText(input.title),
        summary: cleanText(input.summary),
        reason: cleanText(input.reason, '你创建的议题'),
        source: cleanText(input.source, '私人议题'),
        color: cleanText(input.color, 'green'),
        status: cleanText(input.status, '讨论中'),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await query('topic:create', `
        INSERT INTO topics (id, kind, title, summary, reason, source, color, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [topic.id, topic.kind, topic.title, topic.summary, topic.reason, topic.source, topic.color, topic.status, timestamp, timestamp])
      await ensureWorkspace(topic.id, timestamp)
      return topic
    },

    async updateTopic(id, input) {
      const current = await api.getTopic(id)
      if (!current) return null
      const allowed = ['kind', 'title', 'summary', 'reason', 'source', 'color', 'status']
      const next = { ...current, ...Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key))), updatedAt: now() }
      const rows = await query('topic:update', `
        UPDATE topics SET kind = $1, title = $2, summary = $3, reason = $4, source = $5, color = $6, status = $7, updated_at = $8
        WHERE id = $9
        RETURNING *
      `, [next.kind, next.title, next.summary, next.reason, next.source, next.color, next.status, next.updatedAt, id])
      return topicRow(rows[0])
    },

    async deleteTopic(id) {
      const rows = await query('topic:delete', `DELETE FROM topics WHERE id = $1 RETURNING id`, [id])
      return rows.length > 0
    },

    async getWorkspace(topicId) {
      if (!await api.getTopic(topicId)) return null
      await ensureWorkspace(topicId, now())
      const rows = await query('workspace:get', `SELECT * FROM workspaces WHERE topic_id = $1`, [topicId])
      if (!rows[0]) return null
      return workspaceRow(rows[0], await api.listMessages(topicId))
    },

    async updateWorkspace(topicId, input) {
      if (!await api.getTopic(topicId)) return null
      await ensureWorkspace(topicId, now())
      const current = await api.getWorkspace(topicId)
      const allowed = ['note', 'reflection', 'resources', 'summary', 'mindMap', 'selectedModel']
      const next = { ...current, ...Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key))), updatedAt: now() }
      await query('workspace:update', `
        UPDATE workspaces SET note = $1, reflection = $2, resources = $3, summary = $4, mind_map = $5, selected_model = $6, updated_at = $7
        WHERE topic_id = $8
        RETURNING *
      `, [next.note, next.reflection, next.resources, next.summary, next.mindMap, next.selectedModel, next.updatedAt, topicId])
      await query('topic:touch', `UPDATE topics SET updated_at = $1 WHERE id = $2 RETURNING *`, [next.updatedAt, topicId])
      return api.getWorkspace(topicId)
    },

    async listMessages(topicId) {
      const rows = await query('message:list', `SELECT * FROM messages WHERE topic_id = $1 ORDER BY sequence`, [topicId])
      return rows.map(messageRow)
    },

    async addMessage(topicId, input) {
      if (!await api.getTopic(topicId)) return null
      const message = { id: cleanText(input.id) || randomUUID(), role: input.role, content: cleanText(input.content), modelId: cleanText(input.modelId) || null, createdAt: cleanText(input.createdAt) || now() }
      const existing = await query('message:get', `SELECT * FROM messages WHERE id = $1`, [message.id])
      if (existing[0]) return messageRow(existing[0])
      const inserted = await query('message:create', `
        INSERT INTO messages (id, topic_id, role, content, model_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
        RETURNING *
      `, [message.id, topicId, message.role, message.content, message.modelId, message.createdAt])
      if (!inserted[0]) {
        const raced = await query('message:get', `SELECT * FROM messages WHERE id = $1`, [message.id])
        return messageRow(raced[0])
      }
      await query('topic:touch', `UPDATE topics SET updated_at = $1 WHERE id = $2 RETURNING *`, [message.createdAt, topicId])
      return message
    },

    async replaceWeeklySource(sourceId, items, refreshedAt = now()) {
      await query('weekly:delete', `DELETE FROM weekly_items WHERE source_id = $1`, [sourceId])
      for (const item of items) {
        await query('weekly:item:create', `
          INSERT INTO weekly_items (id, source_id, organization, title, url, published_at, category, summary, significance)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [item.id, sourceId, item.organization, item.title, item.url, item.publishedAt, item.category, item.summary || '', item.significance || ''])
      }
      await query('weekly:source-success', `
        INSERT INTO weekly_source_status (source_id, last_success_at, last_attempt_at, error)
        VALUES ($1, $2, $3, NULL)
        ON CONFLICT (source_id) DO UPDATE SET last_success_at = EXCLUDED.last_success_at, last_attempt_at = EXCLUDED.last_attempt_at, error = NULL
      `, [sourceId, refreshedAt, refreshedAt])
    },

    async markWeeklySourceError(sourceId, message, attemptedAt = now()) {
      await query('weekly:source-error', `
        INSERT INTO weekly_source_status (source_id, last_attempt_at, error)
        VALUES ($1, $2, $3)
        ON CONFLICT (source_id) DO UPDATE SET last_attempt_at = EXCLUDED.last_attempt_at, error = EXCLUDED.error
      `, [sourceId, attemptedAt, cleanText(message, '刷新失败')])
    },

    async getWeeklySnapshot(reference = new Date()) {
      const cutoff = new Date(reference.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const itemRows = await query('weekly:item:list', `SELECT * FROM weekly_items WHERE published_at >= $1 AND published_at <= $2 ORDER BY published_at DESC`, [cutoff, reference.toISOString()])
      const sourceRows = await query('weekly:source:list', `SELECT * FROM weekly_source_status ORDER BY source_id`)
      const items = itemRows.map(weeklyItemRow)
      const sources = sourceRows.map(row => ({ id: row.source_id, lastSuccessAt: row.last_success_at || undefined, lastAttemptAt: row.last_attempt_at || undefined, error: row.error || undefined }))
      const updatedAt = sources.map(source => source.lastSuccessAt).filter(Boolean).sort().at(-1)
      return { items, sources, updatedAt, stale: !updatedAt || reference.getTime() - new Date(updatedAt).getTime() > 6 * 60 * 60 * 1000 }
    },

    async saveWeeklyAnalysis(input) {
      const updatedAt = cleanText(input.updatedAt) || now()
      await query('analysis:upsert', `
        INSERT INTO weekly_analyses (analyst_id, fingerprint, markdown, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (analyst_id, fingerprint) DO UPDATE SET markdown = EXCLUDED.markdown, updated_at = EXCLUDED.updated_at
        RETURNING *
      `, [input.analystId, input.fingerprint, input.markdown, updatedAt])
      return { analystId: input.analystId, fingerprint: input.fingerprint, markdown: input.markdown, updatedAt }
    },

    async listWeeklyAnalyses(fingerprint) {
      const rows = fingerprint
        ? await query('analysis:list', `SELECT * FROM weekly_analyses WHERE fingerprint = $1 ORDER BY updated_at DESC`, [fingerprint])
        : await query('analysis:list', `SELECT * FROM weekly_analyses ORDER BY updated_at DESC`)
      return rows.map(weeklyAnalysisRow)
    },

    async exportBackup() {
      const topics = await api.listTopics()
      return { version: 1, exportedAt: now(), topics: await Promise.all(topics.map(async topic => ({ ...topic, workspace: await api.getWorkspace(topic.id) }))) }
    },

    async restoreBackup(backup) {
      if (!backup || backup.version !== 1 || !Array.isArray(backup.topics)) throw new Error('备份文件格式不受支持')
      for (const item of backup.topics) {
        if (await api.getTopic(item.id)) await api.updateTopic(item.id, item)
        else await api.createTopic(item)
        if (item.workspace) {
          await api.updateWorkspace(item.id, item.workspace)
          for (const message of item.workspace.messages || []) await api.addMessage(item.id, message)
        }
      }
      return { restored: true, topics: backup.topics.length }
    },
  }

  return api
}
