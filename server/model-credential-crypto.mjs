import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const KEY_VERSION = 1
const PROVIDER = 'deepseek'

export class CredentialKeyError extends Error {}
export class CredentialDecryptError extends Error {}

function decodeCanonical(value, expectedLength) {
  const encoded = String(value || '')
  const decoded = Buffer.from(encoded, 'base64url')
  if (!encoded || decoded.toString('base64url') !== encoded) throw new Error('invalid base64url')
  if (expectedLength !== undefined && decoded.length !== expectedLength) throw new Error('invalid length')
  return decoded
}

function deriveKey(masterKey, provider) {
  try {
    const root = decodeCanonical(masterKey, 32)
    return Buffer.from(hkdfSync(
      'sha256',
      root,
      Buffer.from('siyu-model-credential-v1'),
      Buffer.from(`provider:${provider}`),
      32,
    ))
  } catch {
    throw new CredentialKeyError('凭据加密服务未正确配置')
  }
}

function aadFor({ provider, status, keyVersion, providerModelId }) {
  return Buffer.from(JSON.stringify([provider, status, keyVersion, providerModelId]), 'utf8')
}

export function encryptModelCredential({ provider, apiKey, providerModelId, masterKey }) {
  if (provider !== PROVIDER) throw new CredentialKeyError('不支持的凭据供应商')
  const iv = randomBytes(12)
  const metadata = { provider, status: 'ready', keyVersion: KEY_VERSION, providerModelId }
  const cipher = createCipheriv('aes-256-gcm', deriveKey(masterKey, provider), iv)
  cipher.setAAD(aadFor(metadata))
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])

  return {
    ...metadata,
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  }
}

export function decryptModelCredential(record, masterKey) {
  try {
    if (record?.provider !== PROVIDER || record.status !== 'ready' || record.keyVersion !== KEY_VERSION) throw new Error('unsupported record')
    const iv = decodeCanonical(record.iv, 12)
    const authTag = decodeCanonical(record.authTag, 16)
    const ciphertext = decodeCanonical(record.ciphertext)
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(masterKey, record.provider), iv)
    decipher.setAAD(aadFor(record))
    decipher.setAuthTag(authTag)
    const apiKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    if (!apiKey) throw new Error('empty key')
    return { apiKey, providerModelId: record.providerModelId }
  } catch (error) {
    if (error instanceof CredentialKeyError) throw error
    throw new CredentialDecryptError('凭据需要重新填写')
  }
}
