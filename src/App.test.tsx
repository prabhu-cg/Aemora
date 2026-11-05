import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Projects', 'Dialog Generator', 'Components', 'Settings']) {
      expect(nav.querySelector(`a[title="${name}"]`)).not.toBeNull()
    }
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeTruthy()
  })
  it('marks the current page', () => {
    at('/app/settings')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(document.querySelector('a[aria-current="page"][title="Settings"]')).not.toBeNull()
  })
  it('switches theme from settings and persists it', async () => {
    at('/app/settings')
    await userEvent.click(screen.getByLabelText('Dark'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('aemora.theme')).toBe('dark')
  })
  it('redirects unknown routes to the landing page', () => {
    at('/nope')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/AEM dialog XML/)
  })
})
