export function mergeTopics<T extends { id: string }>(daily: T[], all: T[]) {
  const seen = new Set<string>()
  return [...daily, ...all].filter(item => !seen.has(item.id) && Boolean(seen.add(item.id)))
}

export function formatChineseDate(date: Date) {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`
}
