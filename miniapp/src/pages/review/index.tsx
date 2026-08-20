import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../../api/client'
import type { WorkspaceData } from '../../api/types'
import { withDeviceAccess } from '../../components/DeviceAccessGate'
import { PageState } from '../../components/PageState'
import { buildLibraryEntries, groupReviewEntries, type ReviewGroup } from '../../features/library'
import './index.scss'

function ReviewPage(){const[groups,setGroups]=useState<ReviewGroup[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');async function load(){setLoading(true);setError('');try{const topics=await api.fetchTopics();const workspaces:WorkspaceData[]=[];for(let index=0;index<topics.length;index+=4)workspaces.push(...await Promise.all(topics.slice(index,index+4).map(topic=>api.fetchWorkspace(topic.id))));setGroups(groupReviewEntries(buildLibraryEntries(topics,workspaces)))}catch(cause){setError(cause instanceof Error?cause.message:'回顾读取失败')}finally{setLoading(false)}}useDidShow(()=>{void load()});return <View className="review-page"><Text className="review-eyebrow">时间里的思考</Text><Text className="review-title">回到那些值得再想一次的地方</Text><PageState loading={loading} error={error} empty={!groups.length} onRetry={load}>{groups.map(group=><View key={group.date} className="review-group"><Text className="review-date">{group.date}</Text>{group.entries.map(item=><View className="review-card" key={item.id} onClick={()=>Taro.navigateTo({url:`/pages/workspace/index?id=${encodeURIComponent(item.topicId)}`})}><Text>{item.kind}</Text><Text className="review-card-title">{item.title}</Text><Text className="review-content">{item.content}</Text></View>)}</View>)}</PageState></View>}

export default withDeviceAccess(ReviewPage)
