// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
  CredentialDecryptError,
  CredentialKeyError,
  decryptModelCredential,
  encryptModelCredential,
} from './model-credential-crypto.mjs'

const masterKey = randomBytes(32).toString('base64url')
const input = {
  provider: 'deepseek',
  apiKey: 'synthetic-deepseek-key',
  providerModelId: 'deepseek-v4-flash',
  masterKey,
}

describe('model credential encryption', () => {
  test('round-trips a key without storing plaintext', () => {
    const record = encryptModelCredential(input)

    expect(record).toMatchObject({
      provider: 'deepseek',
      status: 'ready',
      keyVersion: 1,
      providerModelId: 'deepseek-v4-flash',
    })
    expect(JSON.stringify(record)).not.toContain(input.apiKey)
    expect(decryptModelCredential(record, masterKey)).toEqual({
      apiKey: input.apiKey,
      providerModelId: 'deepseek-v4-flash',
    })
  })

  test('uses a fresh 12-byte IV for every save', () => {
    const first = encryptModelCredential(input)
    const second = encryptModelCredential(input)

    expect(first.iv).not.toBe(second.iv)
    expect(Buffer.from(first.iv, 'base64url')).toHaveLength(12)
    expect(Buffer.from(first.authTag, 'base64url')).toHaveLength(16)
  })

  test.each([
    ['ciphertext', record => ({ ...record, ciphertext: Buffer.from('tampered').toString('base64url') })],
    ['provider model', record => ({ ...record, providerModelId: 'deepseek-v4-pro' })],
    ['key version', record => ({ ...record, keyVersion: 2 })],
    ['IV length', record => ({ ...record, iv: randomBytes(11).toString('base64url') })],
    ['tag length', record => ({ ...record, authTag: randomBytes(15).toString('base64url') })],
  ])('rejects tampered %s without leaking the key', (_name, mutate) => {
    const record = mutate(encryptModelCredential(input))

    expect(() => decryptModelCredential(record, masterKey)).toThrow(CredentialDecryptError)
    try {
      decryptModelCredential(record, masterKey)
    } catch (error) {
      expect(error.message).toBe('凭据需要重新填写')
      expect(error.message).not.toContain(input.apiKey)
    }
  })

  test.each([
    { label: 'missing', invalidRoot: '' },
    { label: '31-byte', invalidRoot: randomBytes(31).toString('base64url') },
    { label: 'non-canonical', invalidRoot: `${randomBytes(32).toString('base64url')}=` },
  ])('rejects a $label master key', ({ invalidRoot }) => {
    expect(() => encryptModelCredential({ ...input, masterKey: invalidRoot })).toThrow(CredentialKeyError)
  })

  test('rejects unsupported providers before encryption', () => {
    expect(() => encryptModelCredential({ ...input, provider: 'custom' })).toThrow('不支持的凭据供应商')
  })
})
