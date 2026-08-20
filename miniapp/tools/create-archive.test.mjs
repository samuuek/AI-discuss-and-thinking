import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('creates a readable ZIP with the compiled mini-program', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'siyu-create-archive-test-'))
  const output = join(directory, '思屿日记-测试归档.zip')

  try {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, 'create-archive.mjs'), output], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const header = await readFile(output)
    assert.equal(header.subarray(0, 2).toString('ascii'), 'PK')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
