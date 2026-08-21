function createCloudHandler({ repository, service, getOpenId }) {
  if (!repository || !service || typeof getOpenId !== 'function') throw new TypeError('云函数初始化失败')

  return async function handle(event = {}) {
    try {
      const openid = getOpenId()
      await repository.ensureOwner(openid)
      const data = await service.execute(event.action, event.payload || {})
      return { ok: true, data }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error && error.message ? error.message : '微信云服务暂时不可用',
        code: 'CLOUD_REQUEST_FAILED',
      }
    }
  }
}

module.exports = { createCloudHandler }
