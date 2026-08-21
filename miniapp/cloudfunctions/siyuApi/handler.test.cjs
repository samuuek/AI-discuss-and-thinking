const { strict: assert } = require('node:assert')
const test = require('node:test')
const { createCloudHandler } = require('./handler.cjs')

test('authorizes the WeChat caller before dispatching an action', async () => {
  const order = []
  const handler = createCloudHandler({
    repository: { async ensureOwner(openid) { order.push(`owner:${openid}`) } },
    service: { async execute(action, payload) { order.push(`action:${action}`); return { payload } } },
    getOpenId: () => 'private-openid',
  })

  const result = await handler({ action: 'health', payload: { value: 1 } })

  assert.deepEqual(order, ['owner:private-openid', 'action:health'])
  assert.deepEqual(result, { ok: true, data: { payload: { value: 1 } } })
})

test('returns a safe Chinese error without exposing owner identifiers', async () => {
  const handler = createCloudHandler({
    repository: { async ensureOwner() { throw new Error('此微信账号无权访问思屿') } },
    service: { async execute() { throw new Error('should not run') } },
    getOpenId: () => 'private-openid',
  })

  const result = await handler({ action: 'health' })

  assert.deepEqual(result, { ok: false, error: '此微信账号无权访问思屿', code: 'CLOUD_REQUEST_FAILED' })
  assert.equal(JSON.stringify(result).includes('private-openid'), false)
})
