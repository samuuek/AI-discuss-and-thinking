function createWebApiService({ baseUrl, accessToken, fetcher }) {
  const origin = String(baseUrl || '').replace(/\/+$/, '')
  const token = String(accessToken || '').trim()
  if (!origin.startsWith('https://')) throw new Error('网页同步服务地址必须使用 HTTPS')
  if (!token) throw new Error('网页同步服务口令未配置')
  if (typeof fetcher !== 'function') throw new TypeError('缺少网页同步请求服务')

  async function request(path, { method = 'GET', body } = {}) {
    const headers = { Authorization: `Bearer ${token}` }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetcher(`${origin}${path}`, {
      headers,
      ...(method === 'GET' ? {} : { method }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.error || '网页同步服务暂时不可用')
    return data
  }

  return {
    async execute(action, payload = {}) {
      if (action === 'health') {
        await request('/api/models')
        return { ok: true }
      }
      if (action === 'fetchTopics') return (await request('/api/topics')).topics
      if (action === 'ensureDailyTopics') return (await request('/api/topics/daily', { method: 'POST', body: {} })).topics
      if (action === 'createTopic') return (await request('/api/topics', { method: 'POST', body: payload })).topic
      if (action === 'fetchWorkspace') return (await request(`/api/workspaces/${encodeURIComponent(payload.topicId)}`)).workspace
      if (action === 'updateWorkspace') return (await request(`/api/workspaces/${encodeURIComponent(payload.topicId)}`, { method: 'PATCH', body: payload.patch || {} })).workspace
      if (action === 'addMessage') return (await request(`/api/workspaces/${encodeURIComponent(payload.topicId)}/messages`, { method: 'POST', body: payload.message || {} })).message
      if (action === 'fetchWeekly') return request('/api/weekly')
      if (action === 'refreshWeekly') return request('/api/weekly/refresh', { method: 'POST', body: {} })
      if (action === 'saveWeeklyAnalysis') return (await request('/api/weekly/analyses', { method: 'POST', body: payload })).analysis
      throw new Error('不支持的同步操作')
    },
  }
}

module.exports = { createWebApiService }
