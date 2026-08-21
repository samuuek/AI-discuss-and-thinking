import { cp, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectArchiveFiles, findSensitiveText } from './archive-safety.mjs'

const projectRoot = resolve(import.meta.dirname, '..')
const requestedOutput = process.argv[2]
if (!requestedOutput || extname(requestedOutput).toLowerCase() !== '.zip') {
  throw new Error('请提供 ZIP 归档输出路径')
}

const outputPath = resolve(requestedOutput)
const files = await collectArchiveFiles(projectRoot)
const textExtensions = new Set(['.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.scss', '.ts', '.tsx'])
const sensitiveFindings = []

for (const relativePath of files) {
  if (!textExtensions.has(extname(relativePath).toLowerCase()) || relativePath.includes('.test.')) continue
  const contents = await readFile(join(projectRoot, relativePath), 'utf8')
  for (const reason of findSensitiveText(contents)) sensitiveFindings.push(`${relativePath}: ${reason}`)
}

if (sensitiveFindings.length) {
  throw new Error(`归档已中止，发现敏感信息：\n${sensitiveFindings.join('\n')}`)
}

const stagingRoot = await mkdtemp(join(tmpdir(), 'siyu-miniapp-archive-'))
const archiveRoot = join(stagingRoot, '思屿日记小程序')

try {
  for (const relativePath of files) {
    const target = join(archiveRoot, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await cp(join(projectRoot, relativePath), target)
  }
  await mkdir(dirname(outputPath), { recursive: true })
  const result = spawnSync('tar.exe', [
    '-a',
    '-c',
    '-f',
    outputPath,
    '-C',
    stagingRoot,
    basename(archiveRoot),
  ], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'ZIP 归档创建失败')
  console.log(`已生成 ${basename(outputPath)}，共 ${files.length} 个文件`)
} finally {
  const resolvedStagingRoot = resolve(stagingRoot)
  if (!resolvedStagingRoot.startsWith(resolve(tmpdir()) + sep)) throw new Error('拒绝清理非临时目录')
  await rm(resolvedStagingRoot, { recursive: true, force: true })
}
