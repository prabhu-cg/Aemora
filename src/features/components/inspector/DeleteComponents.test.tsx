import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { makeComponent, makeProperty } from '../factory'

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

async function open(count = 3) {
  const comps = Array.from({ length: count }, (_, i) => makeComponent({ name: `Card ${i + 1}`, type: 'card', properties: [makeProperty({ key: 'title', label: 'Title', type: 'string' }), makeProperty({ key: 'size', label: 'Size', type: 'enum', allowedValues: ['s', 'l'] })] }))
  const p = await createProject({ name: 'Site' })
  await mutateProject(p.id, (x) => ({
    ...x, components: comps,
    markup: Object.fromEntries(comps.map((c) => [c.id, { files: { css: { content: '.a{}', base: '', edited: true, generatedAt: '2026-01-01' } } }])),
    generatedXml: Object.fromEntries(comps.map((c) => [c.id, { xml: '<x/>', base: '', edited: true, generatedAt: '2026-01-01', format: 'standalone' as const }])),
  }))
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('list', { name: 'Components in this project' })
  return { p, user: userEvent.setup() }
}
const dialog = () => screen.findByRole('alertdialog')

describe('deleting one component', () => {
  it('asks first, in a dialog that says what goes, with Cancel focused', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Delete component Card 2' }))
    const d = await dialog()
    expect(within(d).getByRole('heading', { name: 'Delete “Card 2”?' })).toBeTruthy()
    expect(d.textContent).toMatch(/2 properties, field settings, dialog layout and any markup you edited/)
    expect(d.textContent).toMatch(/can’t be undone/)
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: 'Cancel' }))
  })

  it('does nothing on Cancel, Escape or a click outside, and gives focus back', async () => {
    const { p, user } = await open()
    const trash = screen.getByRole('button', { name: 'Delete component Card 2' })
    await user.click(trash)
    await user.click(within(await dialog()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(trash)
    await dialog()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(trash)
    const d = await dialog()
    await user.click(d.parentElement!)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect((await db.projects.get(p.id))!.components).toHaveLength(3)
  })

  it('keeps Tab inside the dialog', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Delete component Card 1' }))
    const d = await dialog()
    const cancel = within(d).getByRole('button', { name: 'Cancel' })
    const del = within(d).getByRole('button', { name: 'Delete' })
    await user.tab()
    expect(document.activeElement).toBe(del)
    await user.tab()
    expect(document.activeElement).toBe(cancel)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(del)
  })

  it('deletes that component, and what belongs to it, on confirm', async () => {
    const { p, user } = await open()
    await user.click(screen.getByRole('button', { name: 'Delete component Card 2' }))
    await user.click(within(await dialog()).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await db.projects.get(p.id))!.components.map((c) => c.name)).toEqual(['Card 1', 'Card 3']))
    const saved = (await db.projects.get(p.id))!
    expect(Object.keys(saved.markup)).toHaveLength(2)
    expect(Object.keys(saved.generatedXml)).toHaveLength(2)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('deleting all components', () => {
  it('is offered when there is more than one component', async () => {
    await open(2)
    expect(screen.getByRole('button', { name: 'Delete all components' })).toBeTruthy()
  })
  it('is not offered for a single component, where the row’s own delete does the job', async () => {
    await open(1)
    expect(screen.queryByRole('button', { name: 'Delete all components' })).toBeNull()
  })

  it('asks first, says how many go, and names them', async () => {
    const { user } = await open(6)
    await user.click(screen.getByRole('button', { name: 'Delete all components' }))
    const d = await dialog()
    expect(within(d).getByRole('heading', { name: 'Delete all 6 components?' })).toBeTruthy()
    expect(d.textContent).toMatch(/Card 1, Card 2, Card 3, Card 4, and 2 more/)
    expect(d.textContent).toMatch(/The project itself stays/)
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: 'Cancel' }))
  })

  it('changes nothing when cancelled', async () => {
    const { p, user } = await open()
    await user.click(screen.getByRole('button', { name: 'Delete all components' }))
    await user.click(within(await dialog()).getByRole('button', { name: 'Cancel' }))
    expect((await db.projects.get(p.id))!.components).toHaveLength(3)
  })

  it('removes every component and everything that belongs to them, and keeps the project', async () => {
    const { p, user } = await open()
    await user.click(screen.getByRole('button', { name: 'Delete all components' }))
    await user.click(within(await dialog()).getByRole('button', { name: 'Delete all' }))
    await waitFor(async () => expect((await db.projects.get(p.id))!.components).toHaveLength(0))
    const saved = (await db.projects.get(p.id))!
    expect(saved.name).toBe('Site')
    expect(saved.markup).toEqual({})
    expect(saved.generatedXml).toEqual({})
    expect(saved.mappings).toEqual([])
    expect(saved.dialog.components).toEqual({})
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(await screen.findByText(/No components yet/)).toBeTruthy()
  })
})
