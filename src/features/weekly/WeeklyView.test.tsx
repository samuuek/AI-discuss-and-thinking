import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { WeeklyView } from './WeeklyView'
import { buildWeeklyMaterial } from './weekly-handoff'

const api = vi.hoisted(() => ({ fetchWeekly: vi.fn(), refreshWeekly: vi.fn(), saveWeeklyAnalysis: vi.fn() }))
vi.mock('./weekly-api', async () => ({ ...await vi.importActual('./weekly-api'), ...api }))

const snapshot = {
  items: [{ id: 'a', sourceId: 'openai', organization: 'OpenAI', title: 'New model', url: 'https://openai.com/a', publishedAt: '2026-08-15T00:00:00Z', category: '产品', summary: 'Official summary', significance: '' }],
  sources: [], updatedAt: '2026-08-16T00:00:00Z', stale: false, analyses: [],
}

beforeEach(() => {
  vi.restoreAllMocks()
  api.fetchWeekly.mockResolvedValue(snapshot)
  api.refreshWeekly.mockResolvedValue(snapshot)
})

test('shows official items and filters the timeline', async () => {
  const user = userEvent.setup()
  render(<WeeklyView />)
  expect(await screen.findByRole('link', { name: /New model/ })).toHaveAttribute('href', 'https://openai.com/a')
  await user.click(screen.getByRole('button', { name: '研究' }))
  expect(screen.queryByRole('link', { name: /New model/ })).not.toBeInTheDocument()
})

test('copies identical official material for a free web analyst', async () => {
  const user = userEvent.setup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText: vi.fn() } })
  const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
  render(<WeeklyView />)
  await waitFor(() => expect(screen.getAllByText('New model')).toHaveLength(2))
  await user.click(screen.getByRole('button', { name: '交给 DeepSeek 分析' }))
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('New model'))
  expect(open).toHaveBeenCalledWith('https://chat.deepseek.com/', '_blank', 'noopener,noreferrer')
  expect(screen.getByRole('button', { name: '粘贴 DeepSeek 分析' })).toBeInTheDocument()
})

test('shows saved Chinese translations while retaining the official English title', async () => {
  const material = await buildWeeklyMaterial(snapshot.items)
  api.fetchWeekly.mockResolvedValue({ ...snapshot, analyses: [{ analystId: 'weekly-translation', fingerprint: material.fingerprint, markdown: '[{"id":"a","title":"新模型发布","summary":"官方中文摘要"}]', updatedAt: '2026-08-16T01:00:00Z' }] })
  render(<WeeklyView />)
  expect(await screen.findAllByText('新模型发布')).toHaveLength(2)
  expect(screen.getAllByText('New model').length).toBeGreaterThan(0)
  expect(screen.getAllByText('官方中文摘要').length).toBeGreaterThan(0)
})
