export function buildDailyDeepSeekPrompt(dateLabel: string) {
  return `请为我的个人思考空间生成 ${dateLabel} 的三个深度思考议题。议题应彼此不同，适合持续讨论，不要给答案。只输出 3 行，每行一个议题标题，不要编号以外的解释。`
}

export function parseDailyTopicTitles(value: string) {
  const titles = value.split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '').trim()).filter(Boolean)
  if (titles.length !== 3) throw new Error('需要恰好 3 个议题')
  if (titles.some(title => title.length > 200)) throw new Error('议题标题不能超过 200 个字')
  return titles
}

