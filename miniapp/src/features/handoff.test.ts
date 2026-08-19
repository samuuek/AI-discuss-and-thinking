import { expect, test } from 'vitest'
import { buildDeepSeekPrompt, validateImportedAnswer } from './handoff'

test('builds a Chinese prompt containing the topic and new thought', () => {
  const prompt = buildDeepSeekPrompt('技术会让人更自由吗？', [], '先区分选择与控制')
  expect(prompt).toContain('技术会让人更自由吗？')
  expect(prompt).toContain('先区分选择与控制')
})

test('rejects an empty imported answer', () => {
  expect(validateImportedAnswer('  ')).toEqual({ ok: false, error: '请先粘贴 DeepSeek 的回答' })
})

test('trims an imported answer before saving', () => {
  expect(validateImportedAnswer('  回答内容  ')).toEqual({ ok: true, value: '回答内容' })
})
