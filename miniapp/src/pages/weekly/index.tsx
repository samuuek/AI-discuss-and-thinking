import { Button, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { WeeklySnapshot } from '../../api/types'
import { PageState } from '../../components/PageState'
import { buildWeeklyTranslationPrompt, parseSavedTranslations, parseTranslationResponse } from '../../features/weekly'
import './index.scss'

export default function WeeklyPage(){
  const [snapshot,setSnapshot]=useState<WeeklySnapshot|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[translating,setTranslating]=useState(false);const[value,setValue]=useState('')
  const translations=useMemo(()=>parseSavedTranslations(snapshot?.analyses||[]),[snapshot])
  async function load(){setLoading(true);setError('');try{setSnapshot(await api.fetchWeekly())}catch(cause){setError(cause instanceof Error?cause.message:'周报读取失败')}finally{setLoading(false)}}
  useDidShow(()=>{void load()})
  async function refresh(){setLoading(true);try{setSnapshot(await api.refreshWeekly());setError('')}catch(cause){setError(cause instanceof Error?cause.message:'刷新失败')}finally{setLoading(false)}}
  async function copyPrompt(){if(!snapshot)return;await Taro.setClipboardData({data:buildWeeklyTranslationPrompt(snapshot.items)});setTranslating(true);Taro.showToast({title:'翻译提示已复制',icon:'success'})}
  async function paste(){try{setValue((await Taro.getClipboardData()).data||'')}catch{setValue('')}}
  async function save(){if(!snapshot)return;try{const data=parseTranslationResponse(snapshot.items,value);await api.saveWeeklyAnalysis({analystId:'weekly-translation',fingerprint:snapshot.items.map(item=>item.id).join('|'),markdown:JSON.stringify(data)});setTranslating(false);setValue('');await load()}catch(cause){setError(cause instanceof Error?cause.message:'保存译文失败')}}
  return <View className="weekly-page"><Text className="weekly-eyebrow">最近 7 天 · 官方来源</Text><Text className="weekly-title">这一周，AI 又向前走了哪里？</Text><Text className="weekly-lead">从官方发布出发，用中文了解变化与影响。</Text><View className="weekly-actions"><Button onClick={refresh}>刷新官方消息</Button>{snapshot?.items.length&&<Button onClick={copyPrompt}>{translations.size?'更新中文翻译':'翻译成中文'}</Button>}</View><PageState loading={loading} error={error&&!snapshot?error:''} empty={!snapshot?.items.length} onRetry={load}>{snapshot?.sources.some(source=>source.error)&&<Text className="source-warning">部分来源暂时未更新，已保留成功内容。</Text>}{snapshot?.items.map(item=>{const translation=translations.get(item.id);return <View className="weekly-card" key={item.id} onClick={()=>Taro.setClipboardData({data:item.url})}><View className="weekly-meta"><Text>{item.organization}</Text><Text>{new Date(item.publishedAt).toLocaleDateString('zh-CN')}</Text></View><Text className="weekly-card-title">{translation?.title||item.title}</Text><Text className="weekly-summary">{translation?.summary||item.summary}</Text>{translation&&<Text className="weekly-original">原文：{item.title}</Text>}<Text className="copy-link">点击复制原文链接</Text></View>})}</PageState>{translating&&<View className="translation-box"><Text>切换到 DeepSeek 粘贴提示，复制完整 JSON 后回到这里。</Text><Button onClick={paste}>从剪贴板粘贴译文</Button><Textarea value={value} onInput={event=>setValue(event.detail.value)} placeholder="粘贴完整 JSON 数组"/><Button className="save-translation" onClick={save}>保存中文译文</Button></View>}{error&&snapshot&&<Text className="weekly-error">{error}</Text>}</View>
}
