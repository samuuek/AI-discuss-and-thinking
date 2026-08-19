import { expect, test } from 'vitest'
import { buildLibraryEntries, groupReviewEntries } from './library'

const topic={id:'t1',title:'一个议题',kind:'私人议题',summary:'',reason:'',source:'思屿',color:'green'}
const workspace={topicId:'t1',note:'',reflection:'感思',resources:'资料',summary:'总结',mindMap:'',selectedModel:'',updatedAt:'2026-08-19T08:00:00.000Z',messages:[]}

test('turns non-empty workspace fields into searchable entries',()=>{
  const entries=buildLibraryEntries([topic],[workspace])
  expect(entries.map(item=>item.kind)).toEqual(expect.arrayContaining(['纪要','感思','资料']))
})

test('sorts review groups newest first',()=>{
  const entries=[...buildLibraryEntries([topic],[workspace]),{id:'old',topicId:'t1',title:'旧内容',content:'旧',kind:'纪要' as const,updatedAt:'2026-08-18T08:00:00.000Z'}]
  expect(groupReviewEntries(entries).map(group=>group.date)).toEqual(['2026-08-19','2026-08-18'])
})
