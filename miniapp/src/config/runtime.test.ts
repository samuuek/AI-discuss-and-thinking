import { describe, expect, test } from 'vitest'
import { getRuntimeConfig } from './runtime'

describe('getRuntimeConfig', () => {
  test('removes the trailing slash from the HTTPS API address', () => {
    expect(getRuntimeConfig({ TARO_APP_API_BASE_URL: 'https://example.com/' }).apiBaseUrl).toBe('https://example.com')
  })

  test('rejects an insecure remote API address', () => {
    expect(() => getRuntimeConfig({ TARO_APP_API_BASE_URL: 'http://example.com' })).toThrow('必须使用 HTTPS')
  })
})
