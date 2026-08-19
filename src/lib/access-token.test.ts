import { beforeEach, expect, test, vi } from 'vitest'
import { authorizedFetch, setAccessToken } from './access-token'
beforeEach(()=>localStorage.clear())
test('adds the locally stored private bearer token to API requests',async()=>{setAccessToken('device-secret');const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:200}));await authorizedFetch('/api/topics',{method:'GET'},fetcher);expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer device-secret')})
