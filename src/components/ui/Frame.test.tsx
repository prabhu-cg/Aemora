import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../App'
import { FRAME } from './Frame'

describe('layout frame', () => {
  it('is Yedara’s 1152px centred frame with 20/24/32px gutters', () => {
    expect(FRAME).toContain('max-w-[1152px]')
    expect(FRAME).toContain('mx-auto')
    expect(FRAME).toMatch(/px-5 sm:px-6 lg:px-8/)
  })
  it('wraps both the tool and the landing page content', async () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/app']}><AppRoutes /></MemoryRouter>)
    await screen.findByRole('navigation', { name: 'Main' })
    expect(document.querySelector('main#main-content > .max-w-\\[1152px\\]')).not.toBeNull()
    unmount()
    render(<MemoryRouter initialEntries={['/']}><AppRoutes /></MemoryRouter>)
    expect(screen.getByRole('banner').querySelector('.max-w-\\[1152px\\]')).not.toBeNull()
    expect(document.querySelectorAll('main .max-w-\\[1152px\\]').length).toBeGreaterThanOrEqual(5) // every landing section sits in the frame
  })
})
