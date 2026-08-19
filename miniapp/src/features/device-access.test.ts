import { expect, test, vi } from 'vitest'
import { validateDeviceAccess } from './device-access'

test('rejects an empty private access token without making a request', async () => {
  const verify = vi.fn()
  await expect(validateDeviceAccess('  ', verify)).rejects.toThrow('请输入私人访问口令')
  expect(verify).not.toHaveBeenCalled()
})

test('returns the trimmed token after the server accepts it', async () => {
  await expect(validateDeviceAccess(' device-secret ', vi.fn().mockResolvedValue(true))).resolves.toBe('device-secret')
})

test('explains when the server rejects the token', async () => {
  await expect(validateDeviceAccess('wrong', vi.fn().mockResolvedValue(false))).rejects.toThrow('口令不正确')
})
