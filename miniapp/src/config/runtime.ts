type RuntimeEnv = Record<string, string | undefined>

export function getRuntimeConfig(env: RuntimeEnv = process.env) {
  const apiBaseUrl = (env.TARO_APP_API_BASE_URL || 'https://temporary-prompt-ridge-2fk9bxn.vercel.app').replace(/\/$/, '')
  if (!apiBaseUrl.startsWith('https://')) throw new Error('小程序接口必须使用 HTTPS')
  return { apiBaseUrl }
}
