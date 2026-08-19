import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { expect, test } from 'vitest'
import { findSensitiveText } from './repository-safety'

function sourceFiles(directory:string):string[]{return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const path=join(directory,entry.name);if(entry.isDirectory())return sourceFiles(path);if(entry.name.includes('.test.'))return[];return['.ts','.tsx','.json','.scss','.cjs'].includes(extname(entry.name))?[path]:[]})}

test('detects credentials that must never enter the mini-program package',()=>{
  expect(findSensitiveText('DATABASE_URL=private-value')).toContain('数据库环境变量')
  expect(findSensitiveText('postgresql://user:pass@example.test/db')).toContain('数据库连接串')
})

test('tracked mini-program source and config contain no private credentials',()=>{
  const root=join(process.cwd(),'src');const findings=sourceFiles(root).flatMap(file=>findSensitiveText(readFileSync(file,'utf8')).map(reason=>`${file}: ${reason}`))
  expect(findings).toEqual([])
})
