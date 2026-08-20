import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../../api/client'
import type { Topic } from '../../api/types'
import { withDeviceAccess } from '../../components/DeviceAccessGate'
import { PageState } from '../../components/PageState'
import { TopicCard } from '../../components/TopicCard'
import { formatChineseDate, mergeTopics } from '../../features/today'
import '../../components/components.scss'
import './index.scss'

function TodayPage() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')

  async function load() {
    setLoading(true); setError('')
    try { const [daily, all] = await Promise.all([api.ensureDailyTopics(), api.fetchTopics()]); setTopics(mergeTopics(daily, all)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法读取议题') }
    finally { setLoading(false) }
  }
  useDidShow(() => { void load() })

  function open(topic: Topic) { Taro.navigateTo({ url: `/pages/workspace/index?id=${encodeURIComponent(topic.id)}` }) }
  async function create() {
    const value = title.trim(); if (!value) return
    try { const topic = await api.createTopic({ title: value, kind: '私人议题', summary: '', reason: '你创建的议题', source: '思屿', color: 'green' }); setTitle(''); open(topic) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
  }

  return <View className="page today-page"><Text className="eyebrow">{formatChineseDate(new Date())}</Text><Text className="page-title">今天，想聊点什么？</Text><Text className="lead">每天三个议题，为想法留一座可以回来寻找的小岛。</Text><View className="new-topic"><Input value={title} onInput={event => setTitle(event.detail.value)} placeholder="写下一个新的问题"/><Button onClick={create}>新建议题</Button></View><Text className="section-title">今日三题</Text><PageState loading={loading} error={error} empty={!topics.length} onRetry={load}>{topics.slice(0, 3).map(topic => <TopicCard key={topic.id} topic={topic} onOpen={open}/>)}</PageState></View>
}

export default withDeviceAccess(TodayPage)
