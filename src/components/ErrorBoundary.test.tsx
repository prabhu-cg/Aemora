import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

const Bomb = ({ explode }: { explode: boolean }) => { if (explode) throw new Error('kaboom: something broke'); return <p>All fine</p> }
afterEach(() => vi.restoreAllMocks())

describe('error boundary', () => {
  it('passes children through when nothing is wrong', () => {
    render(<ErrorBoundary><Bomb explode={false} /></ErrorBoundary>)
    expect(screen.getByText('All fine')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('replaces a crashed page with a calm message, reassurance about saved work, and ways forward', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ErrorBoundary><Bomb explode /></ErrorBoundary>)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/Something went wrong/)
    expect(alert.textContent).toMatch(/projects are stored in this browser and have not been changed/)
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to your projects' }).getAttribute('href')).toBe('#/app')
    await userEvent.click(screen.getByText('What happened'))
    expect(screen.getByText('kaboom: something broke')).toBeTruthy()
    expect(log).toHaveBeenCalled()
  })

  it('logs the message and a short component trail, never data', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ErrorBoundary><Bomb explode /></ErrorBoundary>)
    const mine = log.mock.calls.find((c) => String(c[0]).startsWith('Aemora hit an unexpected error'))!
    expect(mine[1]).toBe('kaboom: something broke')
    expect(String(mine[2]).split('\n').length).toBeLessThanOrEqual(4)
  })

  it('reload button reloads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<ErrorBoundary><Bomb explode /></ErrorBoundary>)
    await userEvent.click(screen.getByRole('button', { name: 'Reload the page' }))
    expect(reload).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
