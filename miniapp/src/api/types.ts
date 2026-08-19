export type Topic = {
  id: string
  kind: string
  title: string
  summary: string
  reason: string
  source: string
  color: string
  status?: string
  updatedAt?: string
}

export type StoredMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string
  createdAt: string
}

export type WorkspaceData = {
  topicId: string
  note: string
  reflection: string
  resources: string
  summary: string
  mindMap: string
  selectedModel: string
  updatedAt: string
  messages: StoredMessage[]
}

export type WeeklyItem = {
  id: string
  sourceId: string
  organization: string
  title: string
  url: string
  publishedAt: string
  category: string
  summary: string
  significance: string
}

export type WeeklyAnalysis = { analystId: string; fingerprint: string; markdown: string; updatedAt: string }
export type WeeklySourceStatus = { id: string; lastSuccessAt?: string; lastAttemptAt?: string; error?: string }
export type WeeklySnapshot = { items: WeeklyItem[]; sources: WeeklySourceStatus[]; updatedAt?: string; stale: boolean; analyses: WeeklyAnalysis[] }
