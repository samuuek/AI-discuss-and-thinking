import { neon } from '@neondatabase/serverless'
import { handleApiRequest } from '../server/http.mjs'
import { createPostgresStore } from '../server/postgres-store.mjs'

const API_PATH_QUERY = '__siyu_api_path'

function sendDatabaseUnavailable(response, message) {
  response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ error: message, code: 'DATABASE_UNAVAILABLE' }))
}

export function createVercelHandler({ store, env = process.env, createSql = neon, createStore = createPostgresStore } = {}) {
  const databaseUrl = env.DATABASE_URL?.trim()
  let cachedStore = store

  return async (request, response) => {
    if (!cachedStore && !databaseUrl) {
      return sendDatabaseUnavailable(response, '数据库服务未配置')
    }
    try {
      cachedStore ||= createStore(createSql(databaseUrl))
    } catch {
      return sendDatabaseUnavailable(response, '数据库服务暂时不可用')
    }

    const originalUrl = request.url
    const url = new URL(originalUrl, 'http://localhost')
    const rewrittenPath = url.searchParams.get(API_PATH_QUERY)
    if (rewrittenPath !== null) {
      url.pathname = `/api/${rewrittenPath.replace(/^\/+/, '')}`
      url.searchParams.delete(API_PATH_QUERY)
      request.url = `${url.pathname}${url.search}`
    }
    try {
      return await handleApiRequest(request, response, { store: cachedStore, env })
    } finally {
      request.url = originalUrl
    }
  }
}

export default createVercelHandler()
