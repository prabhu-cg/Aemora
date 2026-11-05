import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePresence } from './presence'

describe('usePresence', () => {
  it('mounts at once but opens a frame later so a transition has a start point', async () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, 50), { initialProps: { open: false } })
    expect(result.current).toEqual({ mounted: false, state: 'closed' })
    rerender({ open: true })
    expect(result.current).toEqual({ mounted: true, state: 'closed' })
    await waitFor(() => expect(result.current.state).toBe('open'))
  })
  it('turns closed immediately on close, then unmounts after the exit time', async () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, 60), { initialProps: { open: true } })
    await waitFor(() => expect(result.current.state).toBe('open'))
    rerender({ open: false })
    expect(result.current).toEqual({ mounted: true, state: 'closed' })
    await waitFor(() => expect(result.current.mounted).toBe(false))
  })
  it('reopening mid-exit cancels the unmount', async () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, 80), { initialProps: { open: true } })
    await waitFor(() => expect(result.current.state).toBe('open'))
    rerender({ open: false })
    rerender({ open: true })
    await act(async () => { await new Promise((r) => setTimeout(r, 150)) })
    expect(result.current).toEqual({ mounted: true, state: 'open' })
  })
})
