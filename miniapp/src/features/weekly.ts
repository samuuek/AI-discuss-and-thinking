import type { WeeklyAnalysis, WeeklyItem } from '../api/types'

export type WeeklyTranslation={id:string;title:string;summary:string}

function parse(value:string):WeeklyTranslation[]{
  const data=JSON.parse(value) as unknown
  if(!Array.isArray(data))throw new Error('译文必须是 JSON 数组')
  return data.map(item=>{const entry=item as Partial<WeeklyTranslation>;if(typeof entry.id!=='string'||typeof entry.title!=='string'||typeof entry.summary!=='string'||!entry.title.trim()||!entry.summary.trim())throw new Error('译文格式不完整');return{id:entry.id,title:entry.title.trim(),summary:entry.summary.trim()}})
}

export function parseSavedTranslations(analyses:WeeklyAnalysis[]){
  const saved=[...analyses].reverse().find(item=>item.analystId==='weekly-translation');const map=new Map<string,WeeklyTranslation>();if(!saved)return map
  try{for(const item of parse(saved.markdown))map.set(item.id,item)}catch{return map}return map
}

export function parseTranslationResponse(items:Array<Pick<WeeklyItem,'id'>>,value:string){
  const translations=parse(value);const ids=new Set(translations.map(item=>item.id));if(ids.size!==translations.length||items.some(item=>!ids.has(item.id))||translations.length!==items.length)throw new Error('请为每条周报提供且只提供一份译文');return translations
}

export function buildWeeklyTranslationPrompt(items:WeeklyItem[]){return `请把以下 AI 周报翻译成自然、准确的中文。只输出 JSON 数组，不要 Markdown。每项必须保留原 id，并含 title、summary。\n\n${JSON.stringify(items.map(({id,title,summary})=>({id,title,summary})),null,2)}`}
