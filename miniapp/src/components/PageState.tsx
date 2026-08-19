import { Button, Text, View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'

export function PageState({ loading, error, empty, onRetry, children }: PropsWithChildren<{ loading?: boolean; error?: string; empty?: boolean; onRetry?: () => void }>) {
  if (loading) return <View className="page-state"><Text>正在读取…</Text></View>
  if (error) return <View className="page-state"><Text>{error}</Text>{onRetry&&<Button onClick={onRetry}>重新加载</Button>}</View>
  if (empty) return <View className="page-state"><Text>这里还没有内容，先留下一点想法吧。</Text>{onRetry&&<Button onClick={onRetry}>重新加载</Button>}</View>
  return children
}
