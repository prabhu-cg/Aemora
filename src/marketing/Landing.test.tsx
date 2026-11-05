import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../App'

const open = () => render(<MemoryRouter initialEntries={['/']}><AppRoutes /></MemoryRouter>)

describe('landing page', () => {
  it('has one h1 and calls to action that open the tool and the sample', () => {
    open()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Design properties in. AEM dialog XML out.')
    const tool = screen.getAllByRole('link', { name: /Open the tool/ })
    expect(tool.length).toBeGreaterThanOrEqual(3) // header, hero, closing band
    expect(tool.every((l) => l.getAttribute('href') === '/app')).toBe(true)
    const sample = screen.getAllByRole('link', { name: /sample project/i })
    expect(sample.length).toBeGreaterThanOrEqual(2)
    expect(sample.every((l) => l.getAttribute('href') === '/app/sample')).toBe(true)
  })

  it('has every section, each findable by name', () => {
    open()
    for (const name of ['Introduction', 'How it works', 'Ways in', 'Inside the tool', 'Limits', 'Frequently asked questions', 'Get started']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
  })

  it('walks through the five steps in order', () => {
    open()
    const steps = within(screen.getByRole('region', { name: 'How it works' })).getAllByRole('listitem')
    expect(steps.map((s) => s.querySelector('h3')?.textContent)).toEqual([
      'Bring in a design', 'Review the properties', 'Map each one to an AEM field', 'Arrange the dialog', 'Preview it, then take the XML',
    ])
  })

  it('lists the ways in and is honest that the Figma plugin is not built', () => {
    open()
    const ways = screen.getByRole('region', { name: 'Ways in' })
    expect(within(ways).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Component JSON', 'Clipboard', 'Figma API', 'Screenshot', 'Figma plugin'])
    const plugin = within(ways).getByRole('heading', { name: 'Figma plugin' }).closest('li')!
    expect(plugin.textContent).toMatch(/In development/)
    expect(plugin.textContent).toMatch(/not built yet/)
    expect(within(ways).getAllByText('In development')).toHaveLength(1)
  })

  it('states the limits plainly', () => {
    open()
    const limits = screen.getByRole('region', { name: 'Limits' }).textContent!
    expect(limits).toMatch(/preview is a simulation/)
    expect(limits).toMatch(/not a running AEM instance/)
    expect(limits).toMatch(/has not been tested on a live Cloud Service environment/)
    expect(limits).toMatch(/No AI/)
    expect(limits).toMatch(/never saved, exported or logged/)
  })

  it('invents no customers, testimonials, statistics, prices or integrations', () => {
    open()
    const text = document.body.textContent!
    expect(text).not.toMatch(/customers?\b|testimonial|trusted by|as seen|\b\d+(\.\d+)?\s?%|\$\s?\d|per month|\bpricing\b|\bSlack\b|\bJira\b/i)
    expect(text).not.toMatch(/\b\d{2,}[,.]?\d*\s*(teams|users|developers|designers)\b/i)
  })

  it('shows the real product as labelled sample data, hidden from assistive technology', () => {
    open()
    const figures = screen.getAllByRole('figure')
    expect(figures).toHaveLength(4) // hero + three modules
    for (const f of figures) {
      expect(within(f).getByText('Sample data')).toBeTruthy()
      expect(f.querySelector('figcaption')?.textContent?.length).toBeGreaterThan(20)
      expect(f.querySelector('[aria-hidden="true"]')).toBeTruthy()
    }
  })

  it('draws the previews from the real sample project: true field types, resource types and XML', () => {
    open()
    const text = document.body.textContent!
    for (const t of ['Textfield', 'Textarea', 'Pathfield', 'Switch', 'Select']) expect(text).toContain(t)
    expect(text).toContain('Show description')
    expect(text).toContain('granite/ui/components/coral/foundation/form/switch')
    const xml = within(screen.getByRole('region', { name: 'Inside the tool' })).getAllByText(/jcr:root/)[0].closest('pre')!
    expect(xml.textContent).toContain('sling:resourceType="cq/gui/components/authoring/dialog"')
    expect(xml.textContent).not.toContain('xmlns:')
  })

  it('has one pointer highlight, in the headline only', () => {
    open()
    expect(screen.getByRole('heading', { level: 1 }).querySelectorAll('svg')).toHaveLength(1)
    expect(document.querySelectorAll('main svg path[d^="M3 2l13"]')).toHaveLength(1)
  })

  it('FAQ answers open one at a time', async () => {
    const user = userEvent.setup()
    open()
    const faq = screen.getByRole('region', { name: 'Frequently asked questions' })
    const [a, b] = within(faq).getAllByText(/Do I need Figma\?|Does my design leave the browser\?/)
    await user.click(a)
    expect(a.closest('details')!.open).toBe(true)
    await user.click(b)
    expect(b.closest('details')!.open).toBe(true)
    expect(a.closest('details')!.open).toBe(false)
  })

  it('section links scroll to their section', async () => {
    const user = userEvent.setup()
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    open()
    await user.click(within(screen.getByRole('navigation', { name: 'Page sections' })).getByRole('button', { name: 'FAQ' }))
    expect(scroll).toHaveBeenCalled()
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe('faq')
  })

  it('links to the component JSON schema and the source', () => {
    open()
    const footer = screen.getByRole('navigation', { name: 'Footer' })
    expect(within(footer).getByRole('link', { name: 'Component JSON schema' }).getAttribute('href')).toBe('./schemas/aemora-components-v1.json')
    expect(within(footer).getByRole('link', { name: 'Source on GitHub' }).getAttribute('href')).toBe('https://github.com/prabhu-cg/Aemora')
  })
})
