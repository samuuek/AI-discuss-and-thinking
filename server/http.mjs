import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chatWithModel, publicModels } from './models.mjs'
import { fetchWeeklySource, WEEKLY_SOURCES } from './weekly-sources.mjs'
import { dailyTopicDrafts } from './daily-topics.mjs'
import { authorizePrivateRequest } from './private-access.mjs'
import { CredentialKeyError } from './model-credential-crypto.mjs'
import { DeepSeekProviderError } from './deepseek-client.mjs'
import {
  ModelCredentialServiceError,
  disableDeepSeekConfig,
  getDeepSeekConfig,
  resolveDeepSeekRuntime,
  saveDeepSeekConfig,
  testDeepSeekConfig,
} from './model-credential-service.mjs'

class ApiError extends Error {
  constructor(message, status = 400, code = 'VALIDATION_ERROR') { super(message); this.status = status; this.code = code }
}

async function readJson(request, limit = 1_000_000) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > limit) throw new ApiError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE')
  }
  try { return JSON.parse(body || '{}') } catch { throw new ApiError('请求格式无效') }
}

function requireCredentialAccess(request, env) {
  if (!String(env.SIYU_PRIVATE_ACCESS_TOKEN || '').trim()) {
    throw new ApiError('请先启用私人访问保护', 503, 'PRIVATE_ACCESS_REQUIRED')
  }
  const access = authorizePrivateRequest(request, env)
  if (!access.ok) throw new ApiError(access.message, 401, 'PRIVATE_ACCESS_UNAUTHORIZED')
}

function requireCredentialMutationAllowed(env) {
  if (String(env.VERCEL_ENV || '').trim().toLowerCase() === 'preview') {
    throw new ApiError('Preview 环境禁止修改正式模型凭据', 403, 'CREDENTIAL_PREVIEW_WRITE_FORBIDDEN')
  }
}

function credentialApiKey(input) {
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  if (apiKey.length < 8 || apiKey.length > 512 || /[\u0000-\u001f\u007f]/.test(apiKey)) {
    throw new ApiError('API Key 格式无效')
  }
  return apiKey
}

function providerModelId(input) {
  const modelId = typeof input.providerModelId === 'string' ? input.providerModelId.trim() : ''
  if (!modelId || modelId.length > 128 || /[\u0000-\u001f\u007f]/.test(modelId)) {
    throw new ApiError('DeepSeek 模型无效')
  }
  return modelId
}

async function credentialAction(action) {
  try {
    return await action()
  } catch (error) {
    if (error instanceof ApiError || error instanceof DeepSeekProviderError || error instanceof ModelCredentialServiceError) throw error
    if (error instanceof CredentialKeyError) throw new ApiError(error.message, 503, 'CREDENTIAL_MASTER_KEY_INVALID')
    throw new ApiError('凭据存储暂时不可用', 503, 'CREDENTIAL_STORE_UNAVAILABLE')
  }
}

const send = (response, status, data) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(data))
}

function validateTopic(input) {
  if (typeof input.title !== 'string' || !input.title.trim()) throw new ApiError('议题标题不能为空')
  if (input.title.trim().length > 200) throw new ApiError('议题标题不能超过 200 个字')
}

function validateWorkspace(input) {
  const allowed = new Set(['note', 'reflection', 'resources', 'summary', 'mindMap', 'selectedModel'])
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) throw new ApiError(`不支持字段：${key}`)
    if (typeof value !== 'string') throw new ApiError(`${key} 必须是文本`)
    if (value.length > 200_000) throw new ApiError(`${key} 内容过长`)
  }
}

async function serveStatic(request, response, distDir) {
  if (!distDir || request.method !== 'GET') return false
  const url = new URL(request.url, 'http://localhost')
  const relative = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[/\\]+/, '')
  if (relative.includes('..')) return false
  const file = join(distDir, relative)
  try {
    const content = await readFile(file)
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
    response.end(content)
    return true
  } catch {
    if (extname(relative)) return false
    try { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(await readFile(join(distDir, 'index.html'))); return true } catch { return false }
  }
}

export async function handleApiRequest(request, response, { store, env = process.env, fetcher = fetch, distDir, weeklySources = WEEKLY_SOURCES, weeklyFetcher = fetchWeeklySource, now = () => new Date() } = {}) {
  const url = new URL(request.url, 'http://localhost')
  const path = decodeURIComponent(url.pathname)
  try {
      if (request.method === 'GET' && path === '/api/health') return send(response, 200, { ok: true, database: 'ready', privateAccessRequired: Boolean(String(env.SIYU_PRIVATE_ACCESS_TOKEN || '').trim()) })
      const credentialPath = path.startsWith('/api/model-configs/')
      if (credentialPath) {
        requireCredentialAccess(request, env)
      } else if (path.startsWith('/api/')) {
        const access = authorizePrivateRequest(request, env)
        if (!access.ok) return send(response, access.status, { error: access.message, code: 'UNAUTHORIZED' })
      }
      if (request.method === 'GET' && path === '/api/model-configs/deepseek') {
        return send(response, 200, await credentialAction(() => getDeepSeekConfig({ store, env })))
      }
      if (request.method === 'POST' && path === '/api/model-configs/deepseek/test') {
        const input = await readJson(request, 4_096)
        return send(response, 200, await credentialAction(() => testDeepSeekConfig({ apiKey: credentialApiKey(input), fetcher })))
      }
      if (request.method === 'PUT' && path === '/api/model-configs/deepseek') {
        requireCredentialMutationAllowed(env)
        const input = await readJson(request, 4_096)
        return send(response, 200, await credentialAction(() => saveDeepSeekConfig({
          store,
          env,
          apiKey: credentialApiKey(input),
          providerModelId: providerModelId(input),
          fetcher,
        })))
      }
      if (request.method === 'DELETE' && path === '/api/model-configs/deepseek') {
        requireCredentialMutationAllowed(env)
        return send(response, 200, await credentialAction(() => disableDeepSeekConfig({ store, now })))
      }
      if (request.method === 'GET' && path === '/api/models') {
        try {
          const deepseekStatus = await getDeepSeekConfig({ store, env })
          return send(response, 200, { models: publicModels(env, { deepseekStatus }) })
        } catch {
          return send(response, 200, { models: publicModels(env, { deepseekStatus: { status: 'needs_reentry', source: null } }) })
        }
      }
      if (request.method === 'GET' && path === '/api/weekly') {
        const snapshot = await store.getWeeklySnapshot(new Date())
        return send(response, 200, { ...snapshot, analyses: await store.listWeeklyAnalyses() })
      }
      if (request.method === 'POST' && path === '/api/weekly/refresh') {
        const attemptedAt = new Date().toISOString()
        await Promise.all(weeklySources.map(async source => {
          try { await store.replaceWeeklySource(source.id, await weeklyFetcher(source, { fetcher, now: new Date() }), attemptedAt) }
          catch (error) { await store.markWeeklySourceError(source.id, error instanceof Error ? error.message : '刷新失败', attemptedAt) }
        }))
        const snapshot = await store.getWeeklySnapshot(new Date())
        return send(response, 200, { ...snapshot, analyses: await store.listWeeklyAnalyses() })
      }
      if (request.method === 'POST' && path === '/api/weekly/analyses') {
        const input = await readJson(request)
        if (!['deepseek-web', 'qwen-web', 'kimi-web', 'weekly-translation'].includes(input.analystId)) throw new ApiError('不支持的分析模型')
        if (typeof input.fingerprint !== 'string' || !input.fingerprint.trim()) throw new ApiError('材料版本不能为空')
        if (typeof input.markdown !== 'string' || !input.markdown.trim() || input.markdown.length > 200_000) throw new ApiError('分析内容无效')
        return send(response, 201, { analysis: await store.saveWeeklyAnalysis({ analystId: input.analystId, fingerprint: input.fingerprint.trim(), markdown: input.markdown.trim() }) })
      }
      if (request.method === 'GET' && path === '/api/topics') return send(response, 200, { topics: await store.listTopics({ query: url.searchParams.get('q') || '', status: url.searchParams.get('status') || '' }) })
      if (request.method === 'POST' && path === '/api/topics/daily') {
        const topics = []
        for (const draft of dailyTopicDrafts(now())) {
          topics.push(await store.getTopic(draft.id) || await store.createTopic(draft))
        }
        return send(response, 200, { topics })
      }
      if (request.method === 'POST' && path === '/api/topics') {
        const input = await readJson(request); validateTopic(input)
        return send(response, 201, { topic: await store.createTopic(input) })
      }
      const topicMatch = path.match(/^\/api\/topics\/([^/]+)$/)
      if (topicMatch) {
        const id = topicMatch[1]
        if (request.method === 'GET') { const topic = await store.getTopic(id); if (!topic) throw new ApiError('议题不存在', 404, 'NOT_FOUND'); return send(response, 200, { topic }) }
        if (request.method === 'PATCH') { const input = await readJson(request); if (input.title !== undefined) validateTopic({ title: input.title }); const topic = await store.updateTopic(id, input); if (!topic) throw new ApiError('议题不存在', 404, 'NOT_FOUND'); return send(response, 200, { topic }) }
        if (request.method === 'DELETE') { if (!await store.deleteTopic(id)) throw new ApiError('议题不存在', 404, 'NOT_FOUND'); return send(response, 200, { deleted: true }) }
      }
      const workspaceMatch = path.match(/^\/api\/workspaces\/([^/]+)$/)
      if (workspaceMatch) {
        const topicId = workspaceMatch[1]
        if (request.method === 'GET') { const workspace = await store.getWorkspace(topicId); if (!workspace) throw new ApiError('思考空间不存在', 404, 'NOT_FOUND'); return send(response, 200, { workspace }) }
        if (request.method === 'PATCH') { const input = await readJson(request); validateWorkspace(input); const workspace = await store.updateWorkspace(topicId, input); if (!workspace) throw new ApiError('思考空间不存在', 404, 'NOT_FOUND'); return send(response, 200, { workspace }) }
      }
      const messagesMatch = path.match(/^\/api\/workspaces\/([^/]+)\/messages$/)
      if (messagesMatch) {
        const topicId = messagesMatch[1]
        if (request.method === 'GET') return send(response, 200, { messages: await store.listMessages(topicId) })
        if (request.method === 'POST') {
          const input = await readJson(request)
          if (!['user', 'assistant', 'system'].includes(input.role) || typeof input.content !== 'string' || !input.content.trim() || input.content.length > 200_000) throw new ApiError('消息内容无效')
          const message = await store.addMessage(topicId, input); if (!message) throw new ApiError('思考空间不存在', 404, 'NOT_FOUND')
          return send(response, 201, { message })
        }
      }
      if (request.method === 'POST' && path === '/api/chat') {
        const input = await readJson(request)
        if (!input.model || !Array.isArray(input.messages) || input.messages.length === 0) throw new ApiError('请选择模型并输入消息')
        let deepseekRuntime
        if (input.model === 'deepseek-chat') {
          try { deepseekRuntime = await resolveDeepSeekRuntime({ store, env }) }
          catch { deepseekRuntime = { status: 'needs_reentry', source: null } }
        }
        if (!publicModels(env, deepseekRuntime ? { deepseekStatus: deepseekRuntime } : undefined).some(model => model.id === input.model && model.available)) throw new ApiError('不支持的模型')
        if (input.messages.length > 500 || input.messages.some(message => !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 200_000)) throw new ApiError('消息格式无效')
        if (input.topicId && !await store.getTopic(input.topicId)) throw new ApiError('思考空间不存在', 404, 'NOT_FOUND')
        const lastUser = [...input.messages].reverse().find(message => message.role === 'user')
        if (input.topicId && lastUser) await store.addMessage(input.topicId, { id: input.messageId || randomUUID(), role: 'user', content: lastUser.content })
        const content = await chatWithModel(input, env, fetcher, { deepseekRuntime })
        const message = input.topicId ? await store.addMessage(input.topicId, { role: 'assistant', content, modelId: input.model }) : null
        return send(response, 200, { content, message })
      }
      if (request.method === 'GET' && path === '/api/backup') return send(response, 200, await store.exportBackup())
      if (request.method === 'POST' && path === '/api/restore') {
        const backup = await readJson(request)
        if (!backup || backup.version !== 1 || !Array.isArray(backup.topics)) throw new ApiError('备份文件格式不受支持')
        return send(response, 200, await store.restoreBackup(backup))
      }
      if (!path.startsWith('/api/') && await serveStatic(request, response, distDir)) return
      throw new ApiError('接口不存在', 404, 'NOT_FOUND')
  } catch (error) {
    const safeError = error instanceof ApiError || error instanceof DeepSeekProviderError || error instanceof ModelCredentialServiceError
    const status = safeError ? error.status : 503
    const code = safeError ? error.code : 'SERVICE_UNAVAILABLE'
    const message = safeError ? error.message : '服务暂时不可用'
    send(response, status, { error: message, code })
  }
}

export function createApiServer(options = {}) {
  return createServer((request, response) => handleApiRequest(request, response, options))
}
