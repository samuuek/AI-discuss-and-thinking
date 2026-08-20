const { createSiyuService } = require('./core.cjs')
const { createCloudHandler } = require('./handler.cjs')
const { createCloudRepository } = require('./repository.cjs')
const { createWeeklyRefresher } = require('./weekly-refresh.cjs')
const { WEEKLY_SOURCES, fetchWeeklySource } = require('./weekly-sources.cjs')

function createProductionHandler({ cloud, fetcher }) {
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  const repository = createCloudRepository(cloud.database())
  const weeklyRefresher = createWeeklyRefresher({
    sources: WEEKLY_SOURCES,
    fetchSource: fetchWeeklySource,
    fetcher,
  })
  const service = createSiyuService({ repository, weeklyRefresher })
  return createCloudHandler({
    repository,
    service,
    getOpenId: () => cloud.getWXContext().OPENID,
  })
}

module.exports = { createProductionHandler }
