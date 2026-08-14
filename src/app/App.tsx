import { useState } from 'react'
import { BookOpen, Compass, Library, PenLine, Settings2 } from 'lucide-react'
import {TodayView} from '../features/topics/TodayView'
import type {Topic} from '../features/topics/topic-data'
import {WorkspaceView} from '../features/workspace/WorkspaceView'
import { SpacesView } from '../features/overview/SpacesView'
import { LibraryView } from '../features/overview/LibraryView'
import { ReviewView } from '../features/overview/ReviewView'
import { useEffect } from 'react'
import { fetchModels, fallbackModels, type ModelInfo } from '../features/models/model-api'
import { ModelSettings } from '../features/models/ModelSettings'

type View = 'today' | 'spaces' | 'library' | 'review'
const views = new Set<View>(['today', 'spaces', 'library', 'review'])
function initialView(): View {
 const hash = window.location.hash.slice(1) as View
 return views.has(hash) ? hash : 'today'
}
const navigation = [
  { id: 'today', label: '今日', icon: Compass },
  { id: 'spaces', label: '思考空间', icon: PenLine },
  { id: 'library', label: '知识库', icon: Library },
  { id: 'review', label: '回顾', icon: BookOpen },
] as const

export function App(){
 const [topic,setTopic]=useState<Topic|null>(null)
 const [view,setView]=useState<View>(initialView)
 const [models,setModels]=useState<ModelInfo[]>(fallbackModels)
 const [settingsOpen,setSettingsOpen]=useState(false)
 useEffect(()=>{fetchModels().then(setModels).catch(()=>setModels(fallbackModels))},[])
 function navigate(next: View){setTopic(null);setView(next);window.history.replaceState(null,'',`#${next}`)}
 function content(){if(topic)return <WorkspaceView topic={topic} models={models} onBack={()=>navigate('spaces')}/>;if(view==='spaces')return <SpacesView onOpenTopic={setTopic}/>;if(view==='library')return <LibraryView/>;if(view==='review')return <ReviewView/>;return <TodayView onOpenTopic={setTopic}/>}
 return <div className="app"><header className="topbar"><a className="brand" href="#today" onClick={event=>{event.preventDefault();navigate('today')}}><span>屿</span>思屿</a><nav aria-label="主导航">{navigation.map(({id,label,icon:Icon})=><a key={id} className={!topic&&view===id?'active':''} aria-current={!topic&&view===id?'page':undefined} href={`#${id}`} onClick={event=>{event.preventDefault();navigate(id)}}><Icon size={17}/>{label}</a>)}</nav><button className="model-settings-button" aria-label="模型设置" onClick={()=>setSettingsOpen(true)}><Settings2 size={17}/><span>模型</span></button><button className="avatar" aria-label="个人设置">思</button></header>{content()}{settingsOpen&&<ModelSettings models={models} onClose={()=>setSettingsOpen(false)}/>}</div>
}
