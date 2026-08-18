import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { TopicCard } from './TopicCard'
import type { Topic } from './topic-data'
import { DEEPSEEK_WEB_URL } from '../models/web-handoff'
import { buildDailyDeepSeekPrompt, parseDailyTopicTitles } from './daily-topics'

function dateText(now: Date) {
 const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'long' }).formatToParts(now)
 const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
 return `${value('month')} 月 ${value('day')} 日 · ${value('weekday')}`
}

export function TodayView({topics,onOpenTopic,onCreateTopic,onImportTopics,now=new Date()}:{topics:Topic[];onOpenTopic:(t:Topic)=>void;onCreateTopic:()=>void;onImportTopics?:(titles:string[])=>Promise<void>;now?:Date}){
 const [handoff,setHandoff]=useState(false)
 const [importOpen,setImportOpen]=useState(false)
 const [importValue,setImportValue]=useState('')
 const [importError,setImportError]=useState('')
 const [saving,setSaving]=useState(false)
 const dateLabel=dateText(now).split(' · ')[0]
 async function optimize(){const prompt=buildDailyDeepSeekPrompt(dateLabel);try{await navigator.clipboard.writeText(prompt)}catch{}window.open(DEEPSEEK_WEB_URL,'_blank','noopener,noreferrer');setHandoff(true)}
 async function beginImport(){setImportOpen(true);setImportError('');try{setImportValue((await navigator.clipboard.readText()).trim())}catch{setImportValue('')}}
 async function saveImport(){try{const titles=parseDailyTopicTitles(importValue);setSaving(true);await onImportTopics?.(titles);setImportOpen(false);setHandoff(false)}catch(error){setImportError(error instanceof Error?error.message:'无法导入议题')}finally{setSaving(false)}}
 return <main className="today">
 <header className="hero"><div><p className="date">{dateText(now)}</p><h1>今天，想聊点什么？</h1><p>每天三个新的思考起点，选一个和 AI 慢慢想清楚。</p></div><button className="primary" onClick={onCreateTopic}><Plus size={18}/>新建议题</button></header>
 <section aria-labelledby="daily-title"><div className="section-head"><div><span className="eyebrow"><Sparkles size={14}/>今日三题</span><h2 id="daily-title">为今天留一个值得想的问题</h2></div><button className="text-button" onClick={optimize}>用 DeepSeek 优化</button></div>{handoff&&<div className="handoff-status"><p>提示词已复制。让 DeepSeek 生成后，回到这里导入即可。</p><button className="primary" onClick={beginImport}>导入 DeepSeek 议题</button></div>}<div className="topic-list">{topics.map(t=><TopicCard key={t.id} topic={t} onOpen={onOpenTopic}/>)}</div></section>
 {topics[1]&&<section className="continue"><div><span className="eyebrow">继续思考</span><h2>{topics[1].title}</h2><p>{topics[1].summary}</p></div><button onClick={()=>onOpenTopic(topics[1])}>继续上次对话</button></section>}
 {importOpen&&<div className="import-backdrop" role="presentation"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-import-title"><h2 id="daily-import-title">导入三个新议题</h2><p>每行一个议题；可以先修改，再保存到思屿。</p><textarea aria-label="DeepSeek 议题预览" value={importValue} onChange={event=>setImportValue(event.target.value)} autoFocus/>{importError&&<p className="import-error" role="alert">{importError}</p>}<div className="import-actions"><button className="primary" disabled={saving} onClick={saveImport}>保存三个议题</button><button className="text-button" disabled={saving} onClick={()=>setImportOpen(false)}>取消</button></div></section></div>}
 </main>}
