const ideas = [
  ['今天有哪些“理所当然”，其实值得重新检查？', '从日常习惯里找出一个未经验证的假设。'],
  ['如果把效率暂时放下，什么事情仍然值得做？', '重新辨认价值，而不只计算速度。'],
  ['最近哪一次犹豫，暴露了我真正看重的东西？', '从迟疑中辨认隐藏的优先级。'],
  ['AI 替我完成得越多，我越应该保留什么能力？', '为人与工具之间划出主动选择的边界。'],
  ['什么信息正在占据注意力，却没有改变任何判断？', '检查输入与行动之间是否真正有关联。'],
  ['如果不急着得到答案，这个问题会怎样变化？', '让问题先成熟，再决定如何回答。'],
  ['哪一种“慢”，正在保护我的思考质量？', '区分拖延与必要的沉淀。'],
  ['我最近坚持的观点，最强的反对理由是什么？', '主动寻找能够修正判断的证据。'],
  ['哪些决定应该交给规则，哪些必须保留当下判断？', '思考稳定原则与具体情境的边界。'],
  ['如果只能记住今天的一件事，它应该是什么？', '从纷杂经历中提炼真正重要的线索。'],
  ['我正在解决的问题，真的是最值得解决的吗？', '重新检查问题本身，而不只优化答案。'],
  ['什么变化看起来很小，却可能在一年后产生复利？', '寻找能够持续积累的微小行动。'],
]

export function dailyDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function hash(value) {
  let result = 2166136261
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619)
  return result >>> 0
}

export function dailyTopicDrafts(date = new Date()) {
  const dateKey = dailyDateKey(date)
  const start = hash(dateKey) % ideas.length
  const colors = ['blue', 'green', 'amber']
  return Array.from({ length: 3 }, (_, index) => {
    const [title, summary] = ideas[(start + index * 5) % ideas.length]
    return {
      id: `daily-${dateKey}-${index + 1}`,
      kind: index === 0 ? '热点' : index === 1 ? '为你推荐' : '随机思想',
      title,
      summary,
      reason: '思屿为今天准备的思考起点',
      source: `每日灵感 · ${dateKey}`,
      color: colors[index],
    }
  })
}

