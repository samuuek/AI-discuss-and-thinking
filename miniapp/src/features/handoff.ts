import type { StoredMessage } from '../api/types'

export function buildDeepSeekPrompt(topicTitle: string, messages: StoredMessage[], input: string) {
  const history = messages.filter(item => item.role !== 'system').slice(-8).map(item => `${item.role === 'user' ? '我' : 'AI'}：${item.content}`).join('\n')
  return `你是我的思考伙伴。请围绕议题“${topicTitle}”回应我的最新想法，指出隐含假设，并提出一个值得继续追问的问题。\n\n已有对话：\n${history || '暂无'}\n\n我的最新想法：\n${input.trim()}\n\n请使用中文回答。`
}

export function validateImportedAnswer(value: string) {
  const answer = value.trim()
  return answer ? { ok: true as const, value: answer } : { ok: false as const, error: '请先粘贴 DeepSeek 的回答' }
}
