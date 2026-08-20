import { describe, expect, test, vi } from 'vitest'
import { getRuntimeConfig } from './runtime'

describe('getRuntimeConfig', () => {
  test('removes the trailing slash from the HTTPS API address', () => {
    expect(getRuntimeConfig({ TARO_APP_API_BASE_URL: 'https://example.com/' }).apiBaseUrl).toBe('https://example.com')
  })

  test('rejects an insecure remote API address', () => {
    expect(() => getRuntimeConfig({ TARO_APP_API_BASE_URL: 'http://example.com' })).toThrow('必须使用 HTTPS')
  })

  test('loads the production API address without a Node process global', () => {
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
    expect(result?.apiBaseUrl).toBe('https://temporary-prompt-ridge-2fk9bxn.vercel.app')
  })
})
