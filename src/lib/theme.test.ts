import { describe, expect, it } from 'vitest'
import { applyTheme, readPref, resolveTheme } from './theme'

describe('theme', () => {
  it('resolves system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })
  it('defaults to system and reads stored value', () => {
    expect(readPref()).toBe('system')
    localStorage.setItem('aemora.theme', 'dark')
    expect(readPref()).toBe('dark')
  })
  it('ignores garbage values', () => {
    localStorage.setItem('aemora.theme', 'neon')
    expect(readPref()).toBe('system')
  })
  it('applies the dark class', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
