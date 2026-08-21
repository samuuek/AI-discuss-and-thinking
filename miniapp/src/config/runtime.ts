type RuntimeEnv = Record<string, string | undefined>

export function getRuntimeConfig(env: RuntimeEnv = {}) {
  const cloudEnvId = env.TARO_APP_CLOUD_ENV_ID?.trim() || undefined
  if (cloudEnvId && !/^[a-z][a-z0-9-]{2,63}$/.test(cloudEnvId)) {
    throw new Error('云环境 ID 格式不正确')
  }
  return { cloudEnvId }
}
