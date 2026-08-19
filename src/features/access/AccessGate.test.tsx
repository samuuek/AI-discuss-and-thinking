import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { AccessGate } from './AccessGate'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

test('opens the website normally when private access is not configured', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, privateAccessRequired: false }), { status: 200 })))
  render(<AccessGate><div>私人内容</div></AccessGate>)
  expect(await screen.findByText('私人内容')).toBeInTheDocument()
})

test('stores a valid device token and unlocks private content', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, privateAccessRequired: true }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetcher)
  const user = userEvent.setup()

  render(<AccessGate><div>私人内容</div></AccessGate>)
  await user.type(await screen.findByLabelText('私人访问口令'), 'device-secret')
  await user.click(screen.getByRole('button', { name: '进入思屿' }))

  expect(await screen.findByText('私人内容')).toBeInTheDocument()
  expect(localStorage.getItem('siyu-private-access-token')).toBe('device-secret')
})
