import { Button, Text, Textarea, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../../api/client'
import type { StoredMessage, Topic, WorkspaceData } from '../../api/types'
import { PageState } from '../../components/PageState'
import { buildDeepSeekPrompt, validateImportedAnswer } from '../../features/handoff'
import './index.scss'

type EditableKey='note'|'summary'|'reflection'|'resources'
const emptyWorkspace:WorkspaceData={topicId:'',note:'',reflection:'',resources:'',summary:'',mindMap:'',selectedModel:'deepseek-web',updatedAt:'',messages:[]}

export default function WorkspacePage(){
  const [topic,setTopic]=useState<Topic|null>(null);const [workspace,setWorkspace]=useState(emptyWorkspace);const [messages,setMessages]=useState<StoredMessage[]>([])
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [input,setInput]=useState('');const [waiting,setWaiting]=useState(false);const [importValue,setImportValue]=useState('');const [saving,setSaving]=useState(false)
  useLoad(({id})=>{void load(String(id||''))})
  async function load(id:string){setLoading(true);setError('');try{const [topics,data]=await Promise.all([api.fetchTopics(),api.fetchWorkspace(id)]);setTopic(topics.find(item=>item.id===id)||null);setWorkspace(data);setMessages(data.messages||[])}catch(cause){setError(cause instanceof Error?cause.message:'读取失败')}finally{setLoading(false)}}
  function change(key:EditableKey,value:string){setWorkspace(current=>({...current,[key]:value}))}
  async function saveField(key:EditableKey){try{setSaving(true);await api.updateWorkspace(workspace.topicId,{[key]:workspace[key]});setError('')}catch(cause){setError(cause instanceof Error?cause.message:'保存失败，内容已保留')}finally{setSaving(false)}}
  async function ask(){if(!input.trim()||!topic)return;const user:StoredMessage={id:`mini-${Date.now()}`,role:'user',content:input.trim(),createdAt:new Date().toISOString()};try{await api.addMessage(topic.id,user);setMessages(current=>[...current,user]);const prompt=buildDeepSeekPrompt(topic.title,[...messages,user],input);await Taro.setClipboardData({data:prompt});setInput('');setWaiting(true);Taro.showToast({title:'问题已复制',icon:'success'})}catch(cause){setError(cause instanceof Error?cause.message:'暂时无法保存问题')}}
  async function paste(){try{const result=await Taro.getClipboardData();setImportValue(result.data||'')}catch{setImportValue('')} }
  async function saveAnswer(){if(!topic)return;const checked=validateImportedAnswer(importValue);if(!checked.ok)return setError(checked.error);try{setSaving(true);const message=await api.addMessage(topic.id,{role:'assistant',content:checked.value,modelId:'deepseek-web'});setMessages(current=>[...current,message]);setImportValue('');setWaiting(false);setError('')}catch(cause){setError(cause instanceof Error?cause.message:'保存失败，回答已保留')}finally{setSaving(false)}}
  return <View className="workspace-page"><PageState loading={loading} error={loading?error:''} onRetry={()=>topic&&load(topic.id)}><Text className="workspace-eyebrow">{saving?'保存中…':'自动保存到思屿'}</Text><Text className="workspace-title">{topic?.title||'思考空间'}</Text>{error&&<Text className="workspace-error">{error}</Text>}<View className="conversation">{messages.filter(item=>item.role!=='system').map(item=><View key={item.id} className={`message ${item.role==='assistant'?'assistant':''}`}><Text className="message-role">{item.role==='assistant'?'AI':'你'}</Text><Text>{item.content}</Text></View>)}{!messages.length&&<Text className="empty-chat">从此刻最真实的判断开始。</Text>}</View><Textarea className="thought-input" value={input} onInput={event=>setInput(event.detail.value)} placeholder="写下你的想法……"/><Button className="primary-button" onClick={ask}>复制问题并保存</Button>{waiting&&<View className="handoff"><Text>切换到已登录的 DeepSeek，粘贴问题。复制回答后回到这里。</Text><Button onClick={paste}>从剪贴板粘贴回答</Button>{importValue!==''&&<><Textarea value={importValue} onInput={event=>setImportValue(event.detail.value)} placeholder="可在保存前编辑回答"/><Button className="primary-button" disabled={saving} onClick={saveAnswer}>保存为 AI 回复</Button></>}</View>}<WorkspaceField title="私人旁注" value={workspace.note} onInput={value=>change('note',value)} onSave={()=>saveField('note')}/><WorkspaceField title="纪要" value={workspace.summary} onInput={value=>change('summary',value)} onSave={()=>saveField('summary')}/><WorkspaceField title="感思" value={workspace.reflection} onInput={value=>change('reflection',value)} onSave={()=>saveField('reflection')}/><WorkspaceField title="资料" value={workspace.resources} onInput={value=>change('resources',value)} onSave={()=>saveField('resources')}/></PageState></View>
}

function WorkspaceField({title,value,onInput,onSave}:{title:string;value:string;onInput:(value:string)=>void;onSave:()=>void}){return <View className="workspace-field"><Text>{title}</Text><Textarea value={value} onInput={event=>onInput(event.detail.value)} onBlur={onSave} placeholder={`记录${title}……`}/><Button onClick={onSave}>保存{title}</Button></View>}
