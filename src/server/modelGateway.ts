import type { Plugin } from 'vite'

export type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type ModelRequest = { model: string; messages: ModelMessage[] }
export type PublicModel = { id: string; name: string; provider: string; available: boolean; demo?: boolean }
type Environment = Record<string, string | undefined>

const registry = [
  { id: 'siyu-demo', name: '思屿演示模型', provider: '本地演示', demo: true },
  { id: 'doubao-pro', name: '豆包 Pro', provider: '豆包', key: 'DOUBAO_API_KEY', base: 'DOUBAO_BASE_URL', defaultBase: 'https://ark.cn-beijing.volces.com/api/v3', remoteModel: 'DOUBAO_MODEL' },
  { id: 'qwen-plus', name: '千问 Plus', provider: '千问', key: 'QWEN_API_KEY', base: 'QWEN_BASE_URL', defaultBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', remoteModel: 'QWEN_MODEL' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', key: 'DEEPSEEK_API_KEY', base: 'DEEPSEEK_BASE_URL', defaultBase: 'https://api.deepseek.com', remoteModel: 'DEEPSEEK_MODEL' },
  { id: 'custom-model', name: '自定义模型', provider: '自定义 API', key: 'CUSTOM_API_KEY', base: 'CUSTOM_BASE_URL', defaultBase: '', remoteModel: 'CUSTOM_MODEL' },
] as const

export function publicModels(env: Environment): PublicModel[] {
  return registry.map(model => ({ id: model.id, name: model.name, provider: model.provider, demo: 'demo' in model, available: 'demo' in model || Boolean(model.key && env[model.key]) }))
}

export async function chatWithModel(request: ModelRequest, env: Environment, fetcher: typeof fetch = fetch): Promise<string> {
  const model = registry.find(item => item.id === request.model)
  if (!model) throw new Error('不支持的模型')
  if ('demo' in model) return '这是演示回复。配置模型 API Key 后，就可以在同一个对话界面切换豆包、千问、DeepSeek 或自定义模型。'
  const apiKey = env[model.key]
  if (!apiKey) throw new Error(`${model.provider} 尚未配置 API Key`)
  const baseUrl = (env[model.base] || model.defaultBase).replace(/\/$/, '')
  if (!baseUrl) throw new Error('自定义 API 尚未配置 Base URL')
  const response = await fetcher(`${baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env[model.remoteModel] || model.id, messages: request.messages, stream: false }) })
  if (!response.ok) throw new Error(`${model.provider} 请求失败（${response.status}）`)
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error(`${model.provider} 未返回可读内容`)
  return content
}

async function readJson(request: { on: Function }): Promise<unknown> {
  return new Promise((resolve, reject) => { let body = ''; request.on('data', (chunk: unknown) => { body += String(chunk); if (body.length > 1_000_000) reject(new Error('请求内容过大')) }); request.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('请求格式无效')) } }); request.on('error', reject) })
}

function gatewayMiddleware(env: Environment) {
  return async (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    try {
      if (req.method === 'GET' && req.url === '/api/models') return res.end(JSON.stringify({ models: publicModels(env) }))
      if (req.method === 'POST' && req.url === '/api/chat') {
        const input = await readJson(req) as ModelRequest
        if (!input.model || !Array.isArray(input.messages) || input.messages.length === 0) throw new Error('请选择模型并输入消息')
        return res.end(JSON.stringify({ content: await chatWithModel(input, env) }))
      }
      res.statusCode = 404; return res.end(JSON.stringify({ error: '接口不存在' }))
    } catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: error instanceof Error ? error.message : '请求失败' })) }
  }
}

export function modelGatewayPlugin(env: Environment): Plugin {
  return { name: 'siyu-model-gateway', configureServer(server) { server.middlewares.use(gatewayMiddleware(env)) }, configurePreviewServer(server) { server.middlewares.use(gatewayMiddleware(env)) } }
}
