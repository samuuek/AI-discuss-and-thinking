import { expect, test } from 'vitest'
import { parseSavedTranslations, parseTranslationResponse } from './weekly'

test('uses saved Chinese translations by item ID', () => {
  const map = parseSavedTranslations([{ analystId: 'weekly-translation', fingerprint: 'x', markdown: '[{"id":"a","title":"中文标题","summary":"中文摘要"}]', updatedAt: '' }])
  expect(map.get('a')?.title).toBe('中文标题')
})

test('requires one translation for every current weekly item', () => {
  const items = [{ id: 'a' }, { id: 'b' }]
  expect(() => parseTranslationResponse(items, '[{"id":"a","title":"甲","summary":"摘要"}]')).toThrow('每条周报')
})
