const { createCloudHandler } = require('./handler.cjs')
const { createCloudRepository } = require('./repository.cjs')
const { createWebApiService } = require('./web-api-service.cjs')

function createProductionHandler({ cloud, fetcher, env = process.env }) {
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  const repository = createCloudRepository(cloud.database())
  const service = createWebApiService({
    baseUrl: env.SIYU_WEB_API_BASE_URL,
    accessToken: env.SIYU_PRIVATE_ACCESS_TOKEN,
    fetcher,
  })
  return createCloudHandler({
    repository,
    service,
    getOpenId: () => cloud.getWXContext().OPENID,
  })
}

module.exports = { createProductionHandler }
