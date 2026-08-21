type CloudActionEnvelope<T> = {
  ok: boolean
  data?: T
  error?: string
  code?: string
}

type CloudCallOptions = {
  name: string
  data: { action: string; payload: Record<string, unknown> }
}

type CloudCallResult = { result?: unknown }
type CallFunction = (options: CloudCallOptions) => Promise<CloudCallResult>

export function createCloudTransport(callFunction: CallFunction, { timeoutMs = 12_000 } = {}) {
  return {
    async call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('微信云服务连接超时，请稍后重试')), timeoutMs)
      })

      try {
        const response = await Promise.race([
          callFunction({ name: 'siyuApi', data: { action, payload } }),
          timeout,
        ])
        const envelope = response.result as CloudActionEnvelope<T> | undefined
        if (!envelope || typeof envelope.ok !== 'boolean') throw new Error('微信云服务返回格式无效')
        if (!envelope.ok) throw new Error(envelope.error || '微信云服务暂时不可用')
        return envelope.data as T
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
  }
}

export type CloudTransport = ReturnType<typeof createCloudTransport>
