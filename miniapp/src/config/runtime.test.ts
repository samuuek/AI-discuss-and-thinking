import { describe, expect, test, vi } from 'vitest'
import { getRuntimeConfig } from './runtime'

describe('getRuntimeConfig', () => {
  test('uses the configured WeChat CloudBase environment', () => {
    expect(getRuntimeConfig({ TARO_APP_CLOUD_ENV_ID: 'siyu-prod-123' }).cloudEnvId).toBe('siyu-prod-123')
  })

  test('rejects an invalid CloudBase environment id', () => {
    expect(() => getRuntimeConfig({ TARO_APP_CLOUD_ENV_ID: 'bad env id' })).toThrow('云环境 ID')
  })

  test('can use the app default CloudBase environment without a Node process global', () => {
    vi.stubGlobal('process', undefined)
    let result: ReturnType<typeof getRuntimeConfig> | undefined
    let error: unknown

    try {
      result = getRuntimeConfig()
    } catch (caught) {
      error = caught
    } finally {
      vi.unstubAllGlobals()
    }

    expect(error).toBeUndefined()
    expect(result?.cloudEnvId).toBeUndefined()
  })
})
