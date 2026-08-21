import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { collectArchiveFiles, findSensitiveText, isArchiveSafePath } from './archive-safety.mjs'

test('excludes local secrets, caches, dependencies, and prior archives', () => {
  const excluded = [
    '.env',
    '.env.local',
    'project.private.config.json',
    'node_modules/pkg/index.js',
    'cloudfunctions/siyuApi/node_modules/pkg/index.js',
    '.swc/cache.bin',
    '.vercel/project.json',
    'data/private.json',
    'exports/old.zip',
    'output/log.txt',
    '思屿日记-旧版.zip',
  ]

  for (const path of excluded) assert.equal(isArchiveSafePath(path), false, path)
  assert.equal(isArchiveSafePath('dist/app.js'), true)
  assert.equal(isArchiveSafePath('cloudfunctions/siyuApi/index.js'), true)
})

test('finds credentials before an archive is produced', () => {
  assert.deepEqual(findSensitiveText('DATABASE_URL=postgresql://private'), ['数据库连接串', '数据库环境变量'])
  assert.deepEqual(findSensitiveText('SIYU_PRIVATE_ACCESS_TOKEN=private-value'), ['私人访问口令'])
  assert.deepEqual(findSensitiveText('DEEPSEEK_API_KEY=synthetic-secret'), ['模型 API Key'])
  assert.deepEqual(findSensitiveText('SIYU_CREDENTIAL_MASTER_KEY=synthetic-master-key'), ['凭据加密主密钥'])
})

test('collects only safe project files while retaining the compiled mini-program', async () => {
  const root = await mkdtemp(join(tmpdir(), 'siyu-archive-test-'))
  await mkdir(join(root, 'dist'), { recursive: true })
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
  await writeFile(join(root, 'project.config.json'), '{}')
  await writeFile(join(root, 'dist', 'app.js'), 'compiled')
  await writeFile(join(root, '.env.local'), 'SECRET=hidden')
  await writeFile(join(root, 'node_modules', 'pkg', 'index.js'), 'dependency')

  assert.deepEqual(await collectArchiveFiles(root), ['dist/app.js', 'project.config.json'])
})
