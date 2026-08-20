import { expect, test, vi } from 'vitest'
import { checkCloudAccess, describeCloudAccessError } from './device-access'

test('opens after the owner-locked cloud health check succeeds', async () => {
  const health = vi.fn().mockResolvedValue({ ok: true })

  await expect(checkCloudAccess(health)).resolves.toBe(true)
  expect(health).toHaveBeenCalledOnce()
})

test('translates a missing CloudBase environment into Chinese', () => {
  expect(describeCloudAccessError({ errMsg: 'cloud.callFunction:fail environment not found' })).toBe('微信云环境尚未配置')
})

test('preserves an already-Chinese application error', () => {
  expect(describeCloudAccessError(new Error('此微信账号无权访问思屿'))).toBe('此微信账号无权访问思屿')
})

test('uses a Chinese fallback for an unknown cloud failure', () => {
  expect(describeCloudAccessError(null)).toBe('微信云服务暂时不可用')
})
