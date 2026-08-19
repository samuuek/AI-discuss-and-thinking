import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../../api/client'
import type { Topic } from '../../api/types'
import { PageState } from '../../components/PageState'
import { TopicCard } from '../../components/TopicCard'
import '../../components/components.scss'
import './index.scss'

export default function SpacesPage(){
  const [topics,setTopics]=useState<Topic[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('')
  async function load(){setLoading(true);setError('');try{setTopics(await api.fetchTopics())}catch(cause){setError(cause instanceof Error?cause.message:'读取失败')}finally{setLoading(false)}}
  useDidShow(()=>{void load()})
  const open=(topic:Topic)=>Taro.navigateTo({url:`/pages/workspace/index?id=${encodeURIComponent(topic.id)}`})
  async function create(){try{open(await api.createTopic({title:'一个还没有名字的新想法',kind:'私人议题',summary:'',reason:'你创建的议题',source:'思屿',color:'green'}))}catch(cause){setError(cause instanceof Error?cause.message:'创建失败')}}
  return <View className="page spaces-page"><Text className="eyebrow">所有思考空间</Text><Text className="page-title">所有思考，都有迹可循</Text><Text className="lead">从一个问题开始，慢慢留下对话、旁注、纪要和感思。</Text><Button className="new-space" onClick={create}>新建思考空间</Button><PageState loading={loading} error={error} empty={!topics.length} onRetry={load}>{topics.map(topic=><TopicCard key={topic.id} topic={topic} onOpen={open}/>)}</PageState></View>
}
