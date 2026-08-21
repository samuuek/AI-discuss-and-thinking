import type { StoredMessage, Topic, WeeklyAnalysis, WeeklySnapshot, WorkspaceData } from './types'

export type ActionTransport = {
  call<T>(action: string, payload?: Record<string, unknown>): Promise<T>
}

export function createApiClient(transport: ActionTransport) {
  return {
    health: () => transport.call<{ ok: true }>('health'),
    fetchTopics: () => transport.call<Topic[]>('fetchTopics'),
    ensureDailyTopics: () => transport.call<Topic[]>('ensureDailyTopics'),
    createTopic: (input: Partial<Topic> & { title: string }) => transport.call<Topic>('createTopic', { ...input }),
    fetchWorkspace: (topicId: string) => transport.call<WorkspaceData>('fetchWorkspace', { topicId }),
    updateWorkspace: (topicId: string, patch: Partial<WorkspaceData>) => transport.call<WorkspaceData>('updateWorkspace', { topicId, patch: { ...patch } }),
    addMessage: (topicId: string, input: Partial<StoredMessage> & Pick<StoredMessage, 'role' | 'content'>) => transport.call<StoredMessage>('addMessage', { topicId, message: { ...input } }),
    fetchWeekly: () => transport.call<WeeklySnapshot>('fetchWeekly'),
    refreshWeekly: () => transport.call<WeeklySnapshot>('refreshWeekly'),
    saveWeeklyAnalysis: (input: { analystId: string; fingerprint: string; markdown: string }) => transport.call<WeeklyAnalysis>('saveWeeklyAnalysis', { ...input }),
  }
}
