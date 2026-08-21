import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { ModelSettings } from './ModelSettings'
import { fallbackModels } from './model-api'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

function apiFetcher(initialStatus: Record<string, unknown> = { status: 'unconfigured', source: null }) {
  return vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    if (url === '/api/model-configs/deepseek' && !init.method) return response(initialStatus)
    if (url === '/api/model-configs/deepseek/test' && init.method === 'POST') return response({ models: ['deepseek-v4-flash', 'deepseek-v4-pro'] })
    if (url === '/api/model-configs/deepseek' && init.method === 'PUT') return response({ status: 'ready', source: 'vault', providerModelId: 'deepseek-v4-flash' })
    if (url === '/api/model-configs/deepseek' && init.method === 'DELETE') return response({ status: 'disabled', source: null })
    throw new Error(`unexpected request: ${String(url)} ${init.method || 'GET'}`)
  })
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('siyu-private-access-token', 'private-test-token')
  vi.restoreAllMocks()
})

test('shows a blank protected input and requires a current successful test before saving', async () => {
  vi.stubGlobal('fetch', apiFetcher())
  const user = userEvent.setup()
  render(<ModelSettings models={fallbackModels} onClose={vi.fn()} onModelsRefresh={vi.fn()} />)

  await user.click(screen.getByText('API 高级配置'))
  const keyInput = await screen.findByLabelText('DeepSeek API Key')
  const saveButton = screen.getByRole('button', { name: '保存配置' })

  expect(keyInput).toHaveAttribute('type', 'password')
  expect(keyInput).toHaveAttribute('autocomplete', 'new-password')
  expect(keyInput).toHaveValue('')
  expect(saveButton).toBeDisabled()

  await user.type(keyInput, 'synthetic-key')
  await user.click(screen.getByRole('button', { name: '测试连接' }))
  await user.selectOptions(await screen.findByLabelText('DeepSeek 模型'), 'deepseek-v4-flash')
  expect(saveButton).toBeEnabled()

  await user.type(keyInput, '-changed')
  expect(saveButton).toBeDisabled()
  expect(screen.queryByLabelText('DeepSeek 模型')).not.toBeInTheDocument()
  expect(localStorage.getItem('synthetic-key')).toBeNull()
})

test('saves the tested key, clears the input, and refreshes available models', async () => {
  vi.stubGlobal('fetch', apiFetcher())
  const onModelsRefresh = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<ModelSettings models={fallbackModels} onClose={vi.fn()} onModelsRefresh={onModelsRefresh} />)

  await user.click(screen.getByText('API 高级配置'))
  const keyInput = await screen.findByLabelText('DeepSeek API Key')
  await user.type(keyInput, 'synthetic-key')
  await user.click(screen.getByRole('button', { name: '测试连接' }))
  await user.selectOptions(await screen.findByLabelText('DeepSeek 模型'), 'deepseek-v4-flash')
  await user.click(screen.getByRole('button', { name: '保存配置' }))

  expect(await screen.findByText('已安全保存')).toBeInTheDocument()
  expect(keyInput).toHaveValue('')
  expect(onModelsRefresh).toHaveBeenCalledTimes(1)
})

test('disables a saved credential after confirmation and refreshes models', async () => {
  vi.stubGlobal('fetch', apiFetcher({ status: 'ready', source: 'vault', providerModelId: 'deepseek-v4-flash' }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const onModelsRefresh = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<ModelSettings models={fallbackModels} onClose={vi.fn()} onModelsRefresh={onModelsRefresh} />)

  await user.click(screen.getByText('API 高级配置'))
  expect(await screen.findByText('已安全保存')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '停用并删除网站配置' }))

  expect(await screen.findByText('已停用')).toBeInTheDocument()
  expect(onModelsRefresh).toHaveBeenCalledTimes(1)
})

test('explains re-entry and unmounts the secret input when the panel closes', async () => {
  vi.stubGlobal('fetch', apiFetcher({ status: 'needs_reentry', source: null }))
  const user = userEvent.setup()

  function Harness() {
    const [open, setOpen] = useState(true)
    return open ? <ModelSettings models={fallbackModels} onClose={() => setOpen(false)} onModelsRefresh={vi.fn()} /> : <p>已关闭</p>
  }

  render(<Harness />)
  await user.click(screen.getByText('API 高级配置'))
  expect(await screen.findByText('需要重新填写')).toBeInTheDocument()
  await user.type(screen.getByLabelText('DeepSeek API Key'), 'synthetic-key')
  await user.click(screen.getByRole('button', { name: '关闭对话服务' }))

  expect(screen.getByText('已关闭')).toBeInTheDocument()
  expect(screen.queryByLabelText('DeepSeek API Key')).not.toBeInTheDocument()
})
