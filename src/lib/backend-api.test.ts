import { afterEach, describe, expect, test, vi } from 'vitest'
import { createTopic, ensureDailyTopics, fetchTopics, fetchWorkspace, updateWorkspace } from './backend-api'
import { setAccessToken } from './access-token'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('backend API client', () => {
  test('loads topics from the local backend', async () => {
    setAccessToken('device-secret')
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ topics: [{ id: 'one', title: '议题' }] }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchTopics()).resolves.toEqual([{ id: 'one', title: '议题' }])
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer device-secret')
  })

  test('creates topics and saves workspace fields', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ topic: { id: 'new', title: '新议题' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ workspace: { topicId: 'new', note: '旁注', messages: [] } }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(createTopic({ title: '新议题' })).resolves.toMatchObject({ id: 'new' })
    await expect(updateWorkspace('new', { note: '旁注' })).resolves.toMatchObject({ note: '旁注' })
    expect(fetcher).toHaveBeenLastCalledWith('/api/workspaces/new', expect.objectContaining({ method: 'PATCH' }))
  })

  test('requests the persisted daily topic set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ topics: [{ id: 'daily-1', title: '今日议题' }] }) }))
    await expect(ensureDailyTopics()).resolves.toEqual([{ id: 'daily-1', title: '今日议题' }])
    expect(fetch).toHaveBeenCalledWith('/api/topics/daily', expect.objectContaining({ method: 'POST' }))
  })

  test('loads a complete workspace and exposes backend errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ workspace: { topicId: 'one', messages: [] } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: '保存失败' }) }))
    await expect(fetchWorkspace('one')).resolves.toMatchObject({ topicId: 'one' })
    await expect(updateWorkspace('one', { note: 'x' })).rejects.toThrow('保存失败')
  })
})
