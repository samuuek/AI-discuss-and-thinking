function createWeeklyRefresher({ sources, fetchSource, fetcher }) {
  if (!Array.isArray(sources) || typeof fetchSource !== 'function') throw new TypeError('周报来源配置无效')

  return async function refresh(previous = {}, now = new Date()) {
    const attemptedAt = now.toISOString()
    const previousItems = Array.isArray(previous.items) ? previous.items : []
    const previousStatuses = new Map((previous.sources || []).map(item => [item.id, item]))
    const items = []
    const statuses = []
    let successful = false

    const results = await Promise.all(sources.map(async source => {
      try {
        return { source, sourceItems: await fetchSource(source, { fetcher, now }) }
      } catch (error) {
        return { source, error }
      }
    }))

    for (const result of results) {
      if (!result.error) {
        items.push(...result.sourceItems)
        statuses.push({ id: result.source.id, lastSuccessAt: attemptedAt, lastAttemptAt: attemptedAt })
        successful = true
        continue
      }
      items.push(...previousItems.filter(item => item.sourceId === result.source.id))
      const prior = previousStatuses.get(result.source.id) || {}
      statuses.push({
        id: result.source.id,
        ...(prior.lastSuccessAt ? { lastSuccessAt: prior.lastSuccessAt } : {}),
        lastAttemptAt: attemptedAt,
        error: result.error instanceof Error ? result.error.message : '刷新失败',
      })
    }

    const seen = new Set()
    const uniqueItems = items
      .filter(item => item?.id && !seen.has(item.id) && seen.add(item.id))
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))

    return {
      items: uniqueItems,
      sources: statuses,
      updatedAt: successful ? attemptedAt : previous.updatedAt,
      stale: !successful,
    }
  }
}

module.exports = { createWeeklyRefresher }
