import { describe, expect, test, vi } from 'vitest'
import { createApiClient } from './client-core'

describe('mini-program CloudBase API client', () => {
  test('loads topics through the named cloud action', async () => {
    const transport = { call: vi.fn().mockResolvedValue([{ id: 'topic-1', title: '议题' }]) }
    const client = createApiClient(transport)

    await expect(client.fetchTopics()).resolves.toEqual([{ id: 'topic-1', title: '议题' }])
    expect(transport.call).toHaveBeenCalledWith('fetchTopics')
  })

  test('passes new topic fields directly to the cloud action', async () => {
    const transport = { call: vi.fn().mockResolvedValue({ id: 'topic-2', title: '新的思考' }) }
    const client = createApiClient(transport)

    await client.createTopic({ title: '新的思考', kind: '私人议题' })

    expect(transport.call).toHaveBeenCalledWith('createTopic', { title: '新的思考', kind: '私人议题' })
  })

  test('keeps workspace identity separate from an editable patch', async () => {
    const transport = { call: vi.fn().mockResolvedValue({ topicId: 'topic-1', messages: [] }) }
    const client = createApiClient(transport)

    await client.updateWorkspace('topic-1', { note: '私人旁注' })

    expect(transport.call).toHaveBeenCalledWith('updateWorkspace', {
      topicId: 'topic-1',
      patch: { note: '私人旁注' },
    })
  })

  test('wraps a saved message with its topic identity', async () => {
    const transport = { call: vi.fn().mockResolvedValue({ id: 'message-1', role: 'user', content: '我的问题' }) }
    const client = createApiClient(transport)

    await client.addMessage('topic-1', { role: 'user', content: '我的问题' })

    expect(transport.call).toHaveBeenCalledWith('addMessage', {
      topicId: 'topic-1',
      message: { role: 'user', content: '我的问题' },
    })
  })
})
