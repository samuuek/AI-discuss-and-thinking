export type ModelInfo = { id: string; name: string; provider: string; available: boolean; demo?: boolean }
export const fallbackModels: ModelInfo[] = [
  { id: 'siyu-demo', name: '思屿演示模型', provider: '本地演示', available: true, demo: true },
  { id: 'doubao-pro', name: '豆包 Pro', provider: '豆包', available: false },
  { id: 'qwen-plus', name: '千问 Plus', provider: '千问', available: false },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', available: false },
  { id: 'custom-model', name: '自定义模型', provider: '自定义 API', available: false },
]

export async function fetchModels(): Promise<ModelInfo[]> {
  const response = await fetch('/api/models')
  if (!response.ok) throw new Error('无法读取模型配置')
  return (await response.json() as { models: ModelInfo[] }).models
}

export async function sendChat(model: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages }) })
  const data = await response.json() as { content?: string; error?: string }
  if (!response.ok || !data.content) throw new Error(data.error || '模型请求失败')
  return data.content
}
