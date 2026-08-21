import { beforeEach, expect, test, vi } from 'vitest'
import { authorizedFetch, setAccessToken } from './access-token'

beforeEach(() => localStorage.clear())

test('adds the locally stored private bearer token to API requests', async () => {
  setAccessToken('device-secret')
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

  await authorizedFetch('/api/topics', { method: 'GET' }, fetcher)

  const headers = new Headers(fetcher.mock.calls[0][1]?.headers)
  expect(headers.get('Authorization')).toBe('Bearer device-secret')
})

test('does not send an authorization header before the user unlocks the app', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

  await authorizedFetch('/api/health', undefined, fetcher)

  const headers = new Headers(fetcher.mock.calls[0][1]?.headers)
  expect(headers.has('Authorization')).toBe(false)
})
