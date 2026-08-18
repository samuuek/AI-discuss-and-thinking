import { describe, expect, test } from 'vitest'
import { buildDailyDeepSeekPrompt, parseDailyTopicTitles } from './daily-topics'

describe('daily topic DeepSeek handoff', () => {
  test('builds a prompt that asks for exactly three plain topic titles', () => {
    expect(buildDailyDeepSeekPrompt('2026年8月18日')).toContain('只输出 3 行')
    expect(buildDailyDeepSeekPrompt('2026年8月18日')).toContain('2026年8月18日')
  })

  test('accepts numbered DeepSeek output and returns three clean titles', () => {
    expect(parseDailyTopicTitles('1. 人为什么需要留白？\n2、AI 会怎样改变记忆？\n- 什么值得长期坚持？')).toEqual([
      '人为什么需要留白？',
      'AI 会怎样改变记忆？',
      '什么值得长期坚持？',
    ])
  })

  test('rejects output that does not contain exactly three topics', () => {
    expect(() => parseDailyTopicTitles('只有一个议题')).toThrow('需要恰好 3 个议题')
  })
})
