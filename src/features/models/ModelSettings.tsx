import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, KeyRound, Server, ShieldCheck, X } from 'lucide-react'
import type { ModelInfo } from './model-api'
import {
  disableDeepSeekConfig,
  fetchDeepSeekConfig,
  saveDeepSeekConfig,
  testDeepSeekKey,
  type DeepSeekConfig,
} from './model-config-api'

type BusyAction = 'loading' | 'testing' | 'saving' | 'disabling' | null

const statusLabel = (config: DeepSeekConfig | null) => {
  if (!config) return '正在读取配置'
  if (config.status === 'needs_reentry') return '需要重新填写'
  if (config.status === 'disabled') return '已停用'
  if (config.status === 'ready' && config.source === 'environment') return '由旧环境配置提供'
  if (config.status === 'ready') return '已安全保存'
  return '未配置'
}

export function ModelSettings({
  models,
  onClose,
  onModelsRefresh,
}: {
  models: ModelInfo[]
  onClose: () => void
  onModelsRefresh: () => Promise<void>
}) {
  const webModel = models.find(model => model.kind === 'web-handoff')
  const apiModels = models.filter(model => model.kind === 'api' && model.id !== 'deepseek-chat')
  const [config, setConfig] = useState<DeepSeekConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [providerModels, setProviderModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [testedVersion, setTestedVersion] = useState(-1)
  const [busy, setBusy] = useState<BusyAction>('loading')
  const [error, setError] = useState('')
  const keyRef = useRef('')
  const keyVersionRef = useRef(0)
  const requestVersionRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const requestVersion = ++requestVersionRef.current
    controllerRef.current = controller
    fetchDeepSeekConfig(controller.signal)
      .then(next => {
        if (requestVersion === requestVersionRef.current) setConfig(next)
      })
      .catch(reason => {
        if (!controller.signal.aborted && requestVersion === requestVersionRef.current) {
          setError(reason instanceof Error ? reason.message : '无法读取 DeepSeek 配置')
        }
      })
      .finally(() => {
        if (requestVersion === requestVersionRef.current) setBusy(null)
      })
    return () => {
      requestVersionRef.current += 1
      controller.abort()
      keyRef.current = ''
    }
  }, [])

  const clearSecretState = () => {
    controllerRef.current?.abort()
    requestVersionRef.current += 1
    keyVersionRef.current += 1
    keyRef.current = ''
    setApiKey('')
    setProviderModels([])
    setSelectedModel('')
    setTestedVersion(-1)
    setError('')
    setBusy(null)
  }

  const closePanel = () => {
    clearSecretState()
    onClose()
  }

  const changeApiKey = (value: string) => {
    controllerRef.current?.abort()
    requestVersionRef.current += 1
    keyVersionRef.current += 1
    keyRef.current = value
    setApiKey(value)
    setProviderModels([])
    setSelectedModel('')
    setTestedVersion(-1)
    setError('')
    setBusy(null)
  }

  const testConnection = async () => {
    const key = keyRef.current.trim()
    if (key.length < 8) {
      setError('请输入完整的 DeepSeek API Key')
      return
    }
    const keyVersion = keyVersionRef.current
    const requestVersion = ++requestVersionRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy('testing')
    setError('')
    try {
      const nextModels = await testDeepSeekKey(key, controller.signal)
      if (requestVersion !== requestVersionRef.current || keyVersion !== keyVersionRef.current || key !== keyRef.current.trim()) return
      setProviderModels(nextModels)
      setSelectedModel(nextModels[0] || '')
      setTestedVersion(keyVersion)
    } catch (reason) {
      if (!controller.signal.aborted && requestVersion === requestVersionRef.current) {
        setError(reason instanceof Error ? reason.message : 'DeepSeek 连接测试失败')
      }
    } finally {
      if (requestVersion === requestVersionRef.current) setBusy(null)
    }
  }

  const saveConfiguration = async () => {
    const key = keyRef.current.trim()
    if (!selectedModel || testedVersion !== keyVersionRef.current) return
    const requestVersion = ++requestVersionRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy('saving')
    setError('')
    try {
      const next = await saveDeepSeekConfig(key, selectedModel, controller.signal)
      if (requestVersion !== requestVersionRef.current) return
      setConfig(next)
      keyRef.current = ''
      keyVersionRef.current += 1
      setApiKey('')
      setProviderModels([])
      setSelectedModel('')
      setTestedVersion(-1)
      await onModelsRefresh()
    } catch (reason) {
      if (!controller.signal.aborted && requestVersion === requestVersionRef.current) {
        setError(reason instanceof Error ? reason.message : 'DeepSeek 配置保存失败')
      }
    } finally {
      if (requestVersion === requestVersionRef.current) setBusy(null)
    }
  }

  const disableConfiguration = async () => {
    if (!window.confirm('确认停用并删除网站保存的 DeepSeek 配置吗？')) return
    controllerRef.current?.abort()
    const requestVersion = ++requestVersionRef.current
    setBusy('disabling')
    setError('')
    try {
      const next = await disableDeepSeekConfig()
      if (requestVersion !== requestVersionRef.current) return
      setConfig(next)
      keyRef.current = ''
      keyVersionRef.current += 1
      setApiKey('')
      setProviderModels([])
      setSelectedModel('')
      setTestedVersion(-1)
      await onModelsRefresh()
    } catch (reason) {
      if (requestVersion === requestVersionRef.current) {
        setError(reason instanceof Error ? reason.message : 'DeepSeek 配置停用失败')
      }
    } finally {
      if (requestVersion === requestVersionRef.current) setBusy(null)
    }
  }

  const canSave = Boolean(selectedModel && testedVersion === keyVersionRef.current && apiKey.trim())
  const canDisable = config?.status === 'ready'

  return <div className="settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closePanel() }}>
    <section className="model-settings" role="dialog" aria-modal="true" aria-labelledby="model-settings-title">
      <header><div><span className="eyebrow">选择反馈方式</span><h2 id="model-settings-title">对话服务</h2></div><button aria-label="关闭对话服务" onClick={closePanel}><X /></button></header>
      <p className="settings-intro">免费网页版不需要 API Key；API 模型可在这里安全配置。</p>
      {webModel && <article className="web-service-card"><div className="provider-icon"><ExternalLink size={18} /></div><div><h3>DeepSeek 免费网页版</h3><p>登录自己的账号即可免费使用</p></div><span className="ready"><CheckCircle2 size={14} />网页版可用</span></article>}
      <p className="privacy-note"><ShieldCheck size={16} />思屿不会获取 DeepSeek 账号、密码或登录状态。</p>
      <details className="api-settings">
        <summary>API 高级配置</summary>
        <section className="deepseek-config" aria-labelledby="deepseek-config-title">
          <div className="deepseek-config-heading"><div><h3 id="deepseek-config-title">DeepSeek API</h3><p>密钥加密保存在服务器，仅用于你的对话。</p></div><span className={`credential-status status-${config?.status || 'loading'}`}>{statusLabel(config)}</span></div>
          {config?.status === 'needs_reentry' && <p className="credential-warning">现有凭据无法解密，请重新填写 API Key。</p>}
          <label htmlFor="deepseek-api-key">DeepSeek API Key</label>
          <input
            id="deepseek-api-key"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={apiKey}
            onChange={event => changeApiKey(event.target.value)}
            placeholder="粘贴 DeepSeek API Key"
          />
          <div className="credential-actions">
            <button type="button" className="secondary" disabled={busy !== null || apiKey.trim().length < 8} onClick={testConnection}>{busy === 'testing' ? '正在测试…' : '测试连接'}</button>
          </div>
          {providerModels.length > 0 && <label className="provider-model-field" htmlFor="deepseek-provider-model">DeepSeek 模型<select id="deepseek-provider-model" value={selectedModel} onChange={event => setSelectedModel(event.target.value)}>{providerModels.map(model => <option key={model} value={model}>{model}</option>)}</select></label>}
          {error && <p className="credential-error" role="alert">{error}</p>}
          <p className="credential-cost-note">测试只读取模型列表，不生成对话；实际对话可能产生 DeepSeek API 费用。</p>
          <div className="credential-actions">
            <button type="button" className="primary" disabled={!canSave || busy !== null} onClick={saveConfiguration}>{busy === 'saving' ? '正在保存…' : '保存配置'}</button>
            {canDisable && <button type="button" className="danger" disabled={busy !== null} onClick={disableConfiguration}>{busy === 'disabling' ? '正在停用…' : '停用并删除网站配置'}</button>}
          </div>
        </section>
        <div className="provider-list secondary-providers">{apiModels.map(model => <article key={model.id}><div className="provider-icon"><Server size={18} /></div><div><h3>{model.provider}</h3><p>{model.name}</p></div><span className={model.available ? 'ready' : 'pending'}>{model.available ? <><CheckCircle2 size={14} />已连接</> : <><KeyRound size={14} />待配置</>}</span></article>)}</div>
        <div className="settings-help"><b>其他模型</b><p>豆包、千问和自定义 API 暂时仍由服务端环境配置，后续会逐步迁移到同一安全设置页。</p></div>
      </details>
    </section>
  </div>
}
