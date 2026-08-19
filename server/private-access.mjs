import { timingSafeEqual } from 'node:crypto'

export function authorizePrivateRequest(request, env = {}) {
  const expected = String(env.SIYU_PRIVATE_ACCESS_TOKEN || '').trim()
  if (!expected) return { ok: true }
  const authorization = String(request.headers?.authorization || '')
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  const matches = left.length === right.length && timingSafeEqual(left, right)
  return matches ? { ok: true } : { ok: false, status: 401, message: '私人访问验证失败' }
}
