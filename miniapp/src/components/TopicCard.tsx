import { Text, View } from '@tarojs/components'
import type { Topic } from '../api/types'

export function TopicCard({ topic, onOpen }: { topic: Topic; onOpen: (topic: Topic) => void }) {
  return <View className={`topic-card color-${topic.color || 'green'}`} onClick={() => onOpen(topic)}><View className="topic-meta"><Text>{topic.kind}</Text><Text>{topic.source}</Text></View><Text className="topic-title">{topic.title}</Text>{topic.summary&&<Text className="topic-summary">{topic.summary}</Text>}<Text className="topic-open">进入思考 →</Text></View>
}
