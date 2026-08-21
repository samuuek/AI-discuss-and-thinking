import { Button, Text, View } from '@tarojs/components'
import { useEffect, useState, type ComponentType, type PropsWithChildren } from 'react'
import { api } from '../api/client'
import { checkCloudAccess, describeCloudAccessError } from '../features/device-access'

type AccessState = 'checking' | 'open' | 'error'

function DeviceAccessGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<AccessState>('checking')
  const [connectionError, setConnectionError] = useState('')

  async function checkAccess() {
    setState('checking')
    setConnectionError('')
    try {
      await checkCloudAccess(api.health)
      setState('open')
    } catch (error) {
      setConnectionError(describeCloudAccessError(error))
      setState('error')
    }
  }

  useEffect(() => { void checkAccess() }, [])

  if (state === 'open') return children
  if (state === 'checking') return <View className="unlock-screen"><Text>正在打开思屿…</Text></View>
  return <View className="unlock-screen"><View className="unlock-card"><Text className="unlock-title">暂时无法连接微信云服务</Text><Text className="unlock-copy">请稍后重试；你的内容不会丢失。</Text><Text className="unlock-error">{connectionError}</Text><Button className="primary-button" onClick={checkAccess}>重新连接</Button></View></View>
}

export function withDeviceAccess(PageComponent: ComponentType) {
  return function ProtectedPage() {
    return <DeviceAccessGate><PageComponent /></DeviceAccessGate>
  }
}
