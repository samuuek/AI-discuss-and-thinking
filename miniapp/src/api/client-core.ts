import type { StoredMessage, Topic, WeeklyAnalysis, WeeklySnapshot, WorkspaceData } from './types'

export type RequestOptions = { url: string; method?: string; header?: Record<string, string>; data?: unknown }
export type RequestResult = { statusCode: number; data: unknown }
export type RequestLike = (options: RequestOptions) => Promise<RequestResult>
export type ClientConfig = { apiBaseUrl: string; getAccessToken: () => string }

export function createApiClient(config: ClientConfig, request: RequestLike) {
  async function apiRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const token = config.getAccessToken().trim()
    const header: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) header.Authorization = `Bearer ${token}`
    const response = await request({ url: `${config.apiBaseUrl}${path}`, method: init.method || 'GET', header, data: init.body })
    const data = response.data as T & { error?: string }
    if (response.statusCode === 401) throw new Error('私人访问已失效，请重新配置')
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(data?.error || '请求失败，请稍后重试')
    return data
  }

  return {
    apiRequest,
    fetchModels: () => apiRequest<{ models: unknown[] }>('/api/models'),
    fetchTopics: async () => (await apiRequest<{ topics: Topic[] }>('/api/topics')).topics,
    ensureDailyTopics: async () => (await apiRequest<{ topics: Topic[] }>('/api/topics/daily', { method: 'POST', body: {} })).topics,
    createTopic: async (input: Partial<Topic> & { title: string }) => (await apiRequest<{ topic: Topic }>('/api/topics', { method: 'POST', body: input })).topic,
    fetchWorkspace: async (topicId: string) => (await apiRequest<{ workspace: WorkspaceData }>(`/api/workspaces/${encodeURIComponent(topicId)}`)).workspace,
    updateWorkspace: async (topicId: string, patch: Partial<WorkspaceData>) => (await apiRequest<{ workspace: WorkspaceData }>(`/api/workspaces/${encodeURIComponent(topicId)}`, { method: 'PATCH', body: patch })).workspace,
    addMessage: async (topicId: string, input: Partial<StoredMessage> & Pick<StoredMessage, 'role' | 'content'>) => (await apiRequest<{ message: StoredMessage }>(`/api/workspaces/${encodeURIComponent(topicId)}/messages`, { method: 'POST', body: input })).message,
    fetchWeekly: () => apiRequest<WeeklySnapshot>('/api/weekly'),
    refreshWeekly: () => apiRequest<WeeklySnapshot>('/api/weekly/refresh', { method: 'POST', body: {} }),
    saveWeeklyAnalysis: async (input: { analystId: string; fingerprint: string; markdown: string }) => (await apiRequest<{ analysis: WeeklyAnalysis }>('/api/weekly/analyses', { method: 'POST', body: input })).analysis,
  }
}
