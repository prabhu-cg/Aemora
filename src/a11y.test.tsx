import { afterEach, describe, expect, it } from 'vitest'
import axe, { type Result } from 'axe-core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './App'
import { createProject, mutateProject } from './features/projects/repo'
import { applyImport } from './features/inputs/apply'
import { parseComponentJson } from './features/inputs/json'

const samples = import.meta.glob('./features/inputs/samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/**
 * Automated checks catch a good share of accessibility problems (names, roles, labels, structure, ARIA).
 * They cannot judge colour contrast without a real layout, which is verified separately from the tokens,
 * and they cannot replace trying the tool with a keyboard and a screen reader.
 */
async function violations(root: Element): Promise<string[]> {
  const res = await axe.run(root, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] })
  return res.violations.map((v: Result) => `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 140)).join('\n   ')}`)
}
const clean = async (label: string) => { const v = await violations(document.body); expect(v, `${label}\n${v.join('\n')}`).toEqual([]) }

afterEach(() => { document.title = 'Aemora' })
const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
const tab = (name: string | RegExp) => userEvent.setup().click(screen.getByRole('tab', { name }))

describe('accessibility (automated)', () => {
  it('landing page', async () => { at('/'); await clean('landing') })

  it('projects: empty, and with a project', async () => {
    at('/app'); await screen.findByText('No projects yet'); await clean('projects empty')
  })
  it('projects with a project listed', async () => {
    await createProject({ name: 'Teaser', description: 'A card', aemComponentName: 'card' })
    at('/app'); await screen.findByRole('button', { name: 'Teaser' }); await clean('projects list')
  })
  it('new project drawer', async () => {
    at('/app'); await userEvent.setup().click(await screen.findByRole('button', { name: /New project/ }))
    await screen.findByRole('dialog', { name: 'New project' }); await clean('new project drawer')
  })
  it('settings with backup and restore points', async () => {
    const p = await createProject({ name: 'A' }); void p
    const { createSnapshot } = await import('./features/backup/service')
    await createSnapshot('manual', 'one')
    at('/app/settings'); await screen.findByRole('list', { name: 'Restore points' }); await clean('settings')
  })

  describe('a project, every view', () => {
    const open = async () => {
      const p = await createProject({ name: 'Teaser' })
      await mutateProject(p.id, (x) => ['card', 'container'].reduce((acc, n) => applyImport(acc, parseComponentJson(samples[`./features/inputs/samples/${n}.json`])).project, x))
      at(`/app/generator/${p.id}`); await screen.findByRole('list', { name: /Properties of/ })
    }
    it('input panel and properties', async () => { await open(); await clean('properties view') })
    it('every input method', async () => {
      await open()
      for (const name of ['Clipboard', 'Figma API', 'Screenshot']) { await tab(name); await clean(`input: ${name}`) }
    })
    it('import review', async () => {
      await open(); await userEvent.setup().click(screen.getByRole('button', { name: 'Image' })); await screen.findByRole('region', { name: 'Import review' }); await clean('import review')
    })
    it('property panel', async () => {
      await open(); await userEvent.setup().click(screen.getByRole('button', { name: 'Edit Heading' }))
      await screen.findByRole('complementary', { name: /^Property:/ }); await clean('property panel')
    })
    it('AEM fields view and field panel', async () => {
      await open(); await tab(/AEM fields/); await clean('fields view')
      await userEvent.setup().click(screen.getByRole('button', { name: 'Configure Heading' }))
      await screen.findByRole('complementary', { name: /^Field:/ }); await clean('field panel')
    })
    it('dialog editor with a field selected', async () => {
      await open(); await tab(/^Dialog/); await screen.findByLabelText('Dialog title')
      await userEvent.setup().click(screen.getByRole('button', { name: 'Select Heading' })); await clean('dialog editor')
    })
    it('simulated preview, including after Done with problems', async () => {
      await open(); await tab('Preview'); await screen.findByRole('region', { name: 'Simulated dialog preview' }); await clean('preview')
      await userEvent.setup().click(screen.getByRole('button', { name: 'Done' })); await clean('preview with errors')
    })
    it('XML tab, and the export section', async () => {
      await open(); await tab('XML'); await screen.findByRole('region', { name: 'Dialog XML' }); await clean('xml')
      expect(await screen.findByRole('region', { name: 'Export' })).toBeTruthy(); await clean('export')
    })
  })

  describe('the read-only sample', () => {
    it.each(['Properties', /AEM fields/, /^Dialog/, 'Preview', 'XML'])('%s', async (name) => {
      at('/app/sample'); await screen.findByRole('list', { name: /Properties of/ })
      if (name !== 'Properties') await tab(name)
      await clean(`sample: ${String(name)}`)
    })
  })

  it('the error screen', async () => {
    const { ErrorBoundary } = await import('./components/ErrorBoundary')
    const Bomb = () => { throw new Error('x') }
    const orig = console.error; console.error = () => undefined
    render(<ErrorBoundary><Bomb /></ErrorBoundary>); console.error = orig
    await clean('error boundary')
  })
})

describe('landmarks and titles', () => {
  it('the app has one main landmark, a skip link that targets it, and a labelled primary navigation', async () => {
    at('/app'); await screen.findByRole('navigation', { name: 'Main' })
    expect(screen.getAllByRole('main')).toHaveLength(1)
    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skip.getAttribute('href')).toBe('#main-content')
    expect(document.getElementById('main-content')).toBeTruthy()
    expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
