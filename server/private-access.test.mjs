import { expect, test } from 'vitest'
import { authorizePrivateRequest } from './private-access.mjs'

test('allows requests when private protection is not configured', () => {
  expect(authorizePrivateRequest({ headers: {} }, {}).ok).toBe(true)
})

test('rejects a wrong bearer token when protection is configured', () => {
  const result = authorizePrivateRequest(
    { headers: { authorization: 'Bearer wrong' } },
    { SIYU_PRIVATE_ACCESS_TOKEN: 'right' },
  )
  expect(result.status).toBe(401)
})

test('accepts the configured bearer token', () => {
  const result = authorizePrivateRequest(
    { headers: { authorization: 'Bearer right' } },
    { SIYU_PRIVATE_ACCESS_TOKEN: 'right' },
  )
  expect(result.ok).toBe(true)
})
