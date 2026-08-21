import { readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

const blockedSegments = new Set([
  '.git',
  '.swc',
  '.vercel',
  'data',
  'exports',
  'node_modules',
  'output',
])

function normalizePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '')
}

export function isArchiveSafePath(value) {
  const path = normalizePath(value)
  const segments = path.split('/').filter(Boolean)
  const name = segments.at(-1) || ''

  if (segments.some(segment => blockedSegments.has(segment))) return false
  if (name === 'project.private.config.json') return false
  if (name === '.env' || name.startsWith('.env.')) return false
  if (name.toLowerCase().endsWith('.zip')) return false
  return true
}

export function findSensitiveText(value) {
  const findings = []
  if (/postgres(?:ql)?:\/\//i.test(value)) findings.push('数据库连接串')
  if (/DATABASE_URL\s*=\s*\S+/i.test(value)) findings.push('数据库环境变量')
  if (/SIYU_PRIVATE_ACCESS_TOKEN\s*=\s*\S+/i.test(value)) findings.push('私人访问口令')
  if (/Authorization\s*:\s*['"]Bearer\s+[A-Za-z0-9_-]{16,}/i.test(value)) findings.push('硬编码访问头')
  return findings
}

export async function collectArchiveFiles(projectRoot) {
  const root = resolve(projectRoot)
  const files = []

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name)
      const relativePath = relative(root, absolutePath).split(sep).join('/')
      if (!isArchiveSafePath(relativePath) || entry.isSymbolicLink()) continue
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile()) files.push(relativePath)
    }
  }

  await visit(root)
  return files.sort()
}
