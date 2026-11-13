import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readPref } from './theme'

describe('theme', () => {
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('defaults to light and reads a stored value', () => {
    expect(readPref()).toBe('light')
    localStorage.setItem('aemora.theme', 'dark')
    expect(readPref()).toBe('dark')
  })
  it('ignores garbage values', () => {
    localStorage.setItem('aemora.theme', 'neon')
    expect(readPref()).toBe('light')
  })
  it('carries an older "system" choice over once, as the device preference', () => {
    localStorage.setItem('aemora.theme', 'system')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(readPref()).toBe('dark')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(readPref()).toBe('light')
  })
  it('applies the dark class', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
