import { useEffect, useState, type PropsWithChildren } from 'react'
import { getAccessToken, setAccessToken } from '../../lib/access-token'

type AccessState = 'checking' | 'open' | 'locked' | 'error'

export function AccessGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<AccessState>('checking')
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const health = await fetch('/api/health')
        const data = await health.json() as { privateAccessRequired?: boolean }
        if (!active) return
        if (!data.privateAccessRequired) return setState('open')
        const stored = getAccessToken()
        if (!stored) return setState('locked')
        const response = await fetch('/api/models', { headers: { Authorization: `Bearer ${stored}` } })
        if (active) setState(response.ok ? 'open' : 'locked')
      } catch {
        if (active) setState('error')
      }
    })()
    return () => { active = false }
  }, [])

  async function unlock() {
    const value = token.trim()
    if (!value) return setMessage('请输入私人访问口令')
    setMessage('')
    try {
      const response = await fetch('/api/models', { headers: { Authorization: `Bearer ${value}` } })
      if (!response.ok) return setMessage('口令不正确，请重新输入')
      setAccessToken(value)
      setState('open')
    } catch {
      setMessage('暂时无法连接，请稍后重试')
    }
  }

  if (state === 'open') return children
  if (state === 'checking') return <main className="access-screen"><p>正在打开思屿…</p></main>
  if (state === 'error') return <main className="access-screen"><h1>暂时无法连接</h1><p>请检查网络后刷新页面。</p></main>
  return <main className="access-screen"><section><span className="eyebrow">私人空间</span><h1>进入思屿</h1><p>请输入你在本设备使用的私人访问口令。</p><label htmlFor="siyu-access-token">私人访问口令</label><input id="siyu-access-token" type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="current-password"/>{message&&<p role="alert">{message}</p>}<button className="primary" onClick={unlock}>进入思屿</button></section></main>
}
