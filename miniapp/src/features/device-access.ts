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
  if (/environment not found|invalid env/i.test(message)) return '微信云环境尚未配置'
  if (/cloud\.callFunction|request:fail|time out|timeout/i.test(message)) return '微信云服务调用失败，请稍后重试'
  if (/[㐀-鿿]/.test(message)) return message
  return '微信云服务暂时不可用'
}
