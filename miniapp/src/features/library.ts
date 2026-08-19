import type { Topic, WorkspaceData } from '../api/types'

export type LibraryEntry={id:string;topicId:string;title:string;content:string;kind:'纪要'|'感思'|'资料'|'旁注'|'对话';updatedAt:string}
export type ReviewGroup={date:string;entries:LibraryEntry[]}

export function buildLibraryEntries(topics:Topic[],workspaces:WorkspaceData[]){
  const topicById=new Map(topics.map(item=>[item.id,item]));const entries:LibraryEntry[]=[]
  for(const workspace of workspaces){const title=topicById.get(workspace.topicId)?.title||'未命名议题';const updatedAt=workspace.updatedAt||new Date(0).toISOString();const fields:Array<[LibraryEntry['kind'],string]>= [['纪要',workspace.summary],['感思',workspace.reflection],['资料',workspace.resources],['旁注',workspace.note]];for(const[kind,content]of fields)if(content?.trim())entries.push({id:`${workspace.topicId}-${kind}`,topicId:workspace.topicId,title,content:content.trim(),kind,updatedAt});const dialogue=(workspace.messages||[]).filter(item=>item.role!=='system').map(item=>`${item.role==='assistant'?'AI':'我'}：${item.content}`).join('\n');if(dialogue)entries.push({id:`${workspace.topicId}-对话`,topicId:workspace.topicId,title,content:dialogue,kind:'对话',updatedAt})}
  return entries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
}

export function groupReviewEntries(entries:LibraryEntry[]){const groups=new Map<string,LibraryEntry[]>();for(const entry of entries){const date=entry.updatedAt.slice(0,10);groups.set(date,[...(groups.get(date)||[]),entry])}return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([date,items])=>({date,entries:items}))}
