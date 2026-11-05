import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './App'

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)

describe('routing and shell', () => {
  it('renders the landing page at /', () => {
    at('/')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/AEM dialog XML/)
    expect(screen.getByRole('link', { name: /open the tool/i }).getAttribute('href')).toBe('/app')
  })
  it('renders the four navigation items in the app shell', () => {
    at('/app')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const name of ['Projects', 'Dialog Generator', 'Components', 'Settings']) {
      expect(within(nav).getByRole('link', { name })).toBeTruthy()
    }
    expect(within(nav).getByText('Workspace')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeTruthy()
  })
  it('marks the current page', () => {
    at('/app/settings')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
  })
  it('switches theme from settings and persists it', async () => {
    at('/app/settings')
    await userEvent.click(screen.getByLabelText('Dark'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('aemora.theme')).toBe('dark')
  })
  it('shows the brand tagline on the landing page and opens the mobile navigation drawer', async () => {
    at('/')
    expect(screen.getByText('Generate. Build. Scale.')).toBeTruthy()
    at('/app')
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' })
    await userEvent.click(within(dialog).getByRole('link', { name: 'Settings' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('redirects unknown routes to the landing page', () => {
    at('/nope')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/AEM dialog XML/)
  })
})
