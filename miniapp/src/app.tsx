import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { getRuntimeConfig } from './config/runtime'
import { validateDeviceAccess } from './features/device-access'
import './app.scss'

export default function App({ children }: PropsWithChildren) {
  const [state, setState] = useState<'checking' | 'open' | 'locked' | 'error'>('checking')
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')
  const { apiBaseUrl } = getRuntimeConfig()

  async function verify(value: string) {
    const result = await Taro.request({ url: `${apiBaseUrl}/api/models`, header: { Authorization: `Bearer ${value}` } })
    return result.statusCode >= 200 && result.statusCode < 300
  }

  useEffect(() => {
    ;(async () => {
      try {
        const health = await Taro.request<{ privateAccessRequired?: boolean }>({ url: `${apiBaseUrl}/api/health` })
        if (!health.data.privateAccessRequired) return setState('open')
        const saved = String(Taro.getStorageSync('siyu-access-token') || '')
        setState(saved && await verify(saved) ? 'open' : 'locked')
      } catch { setState('error') }
    })()
  }, [])

  async function unlock() {
    setMessage('')
    try {
      const value = await validateDeviceAccess(token, verify)
      Taro.setStorageSync('siyu-access-token', value)
      setState('open')
    } catch (error) { setMessage(error instanceof Error ? error.message : '暂时无法连接') }
  }

  if (state === 'open') return children
  if (state === 'checking') return <View className="unlock-screen"><Text>正在打开思屿…</Text></View>
  if (state === 'error') return <View className="unlock-screen"><Text>暂时无法连接，请检查网络后重试。</Text></View>
  return <View className="unlock-screen"><View className="unlock-card"><Text className="unlock-eyebrow">私人空间</Text><Text className="unlock-title">进入思屿</Text><Text className="unlock-copy">请输入你在本设备使用的私人访问口令。</Text><Input password value={token} onInput={event => setToken(event.detail.value)} placeholder="私人访问口令"/>{message&&<Text className="unlock-error">{message}</Text>}<Button className="primary-button" onClick={unlock}>进入思屿</Button></View></View>
}
