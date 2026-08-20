import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

test('keeps the Taro app entry as a page pass-through', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'app.tsx'), 'utf8')

  expect(source).toMatch(/return children/)
  expect(source).not.toContain('unlock-screen')
})
