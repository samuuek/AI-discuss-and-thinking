import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { TodayView } from './TodayView'
import { topics } from './topic-data'

test('shows the real date and offers free DeepSeek topic optimization', async () => {
  const user = userEvent.setup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText: vi.fn().mockResolvedValue('1. 议题甲\n2. 议题乙\n3. 议题丙') } })
  vi.spyOn(window, 'open').mockReturnValue({} as Window)
  const onImportTopics = vi.fn().mockResolvedValue(undefined)

  render(<TodayView topics={topics} onOpenTopic={() => {}} onCreateTopic={() => {}} onImportTopics={onImportTopics} now={new Date('2026-08-18T02:00:00.000Z')} />)

  expect(screen.getByText('8 月 18 日 · 星期二')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '用 DeepSeek 优化' }))
  expect(writeText).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '导入 DeepSeek 议题' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '导入 DeepSeek 议题' }))
  await user.click(screen.getByRole('button', { name: '保存三个议题' }))
  expect(onImportTopics).toHaveBeenCalledWith(['议题甲', '议题乙', '议题丙'])
})
