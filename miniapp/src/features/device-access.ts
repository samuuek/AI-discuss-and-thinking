export async function checkCloudAccess(health: () => Promise<unknown>) {
  await health()
  return true
}

export function describeCloudAccessError(error: unknown) {
  let message = ''
  if (typeof error === 'object' && error !== null && 'errMsg' in error) {
    message = String(error.errMsg).trim()
  }
  if (!message && error instanceof Error) message = error.message.trim()
  if (/environment not found|invalid env/i.test(message)) return '微信云环境尚未创建，请先在微信开发者工具中开通云开发'
  if (/cloud\.callFunction|request:fail|time out|timeout/i.test(message)) return '微信云函数连接超时，请确认 siyuApi 已部署后重试'
  if (/[㐀-鿿]/.test(message)) return message
  return '微信云服务暂时不可用'
}
