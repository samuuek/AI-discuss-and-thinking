import { expect, test } from 'vitest'
import { formatChineseDate, mergeTopics } from './today'

test('keeps daily topics first and removes duplicate topic ids', () => {
  const daily = [{ id: 'daily', title: '今日' }]
  const all = [{ id: 'daily', title: '重复' }, { id: 'saved', title: '旧议题' }]
  expect(mergeTopics(daily, all).map(item => item.title)).toEqual(['今日', '旧议题'])
})

test('formats a stable Chinese calendar date', () => {
  expect(formatChineseDate(new Date('2026-08-19T10:00:00+08:00'))).toBe('2026年8月19日 · 星期三')
})
