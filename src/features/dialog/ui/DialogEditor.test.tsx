import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { applyImport } from '../../inputs/apply'
import { parseComponentJson } from '../../inputs/json'
import { placedIds } from '../ops'

const samples = import.meta.glob('../../inputs/samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sample = (n: string) => samples[`../../inputs/samples/${n}.json`]

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

const GROUPS: Record<string, string> = { heading: 'Content', description: 'Content', image: 'Content › Media', backgroundVariant: 'Style' }

async function open() {
  const p = await createProject({ name: 'Teaser' })
  await mutateProject(p.id, (x) => {
    const withCard = applyImport(x, parseComponentJson(sample('card'))).project
    return { ...withCard, components: withCard.components.map((c) => ({ ...c, properties: c.properties.map((pp) => ({ ...pp, group: GROUPS[pp.key] ?? pp.group })) })) }
  })
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('list', { name: /Properties of/ })
  await userEvent.setup().click(screen.getByRole('tab', { name: /^Dialog/ }))
  await screen.findByLabelText('Dialog title')
  return p
}
const stored = async (id: string) => (await db.projects.get(id))!
const dlg = async (id: string) => Object.values((await stored(id)).dialog.components)[0]
const keyOf = async (id: string, pid: string) => (await stored(id)).components[0].properties.find((x) => x.id === pid)!.key
const keys = async (id: string, ids: string[]) => Promise.all(ids.map((x) => keyOf(id, x)))

describe('dialog editor', () => {
  it('shows the layout built from property groups: tabs, a section, and fields', async () => {
    await open()
    expect(screen.getByLabelText('Tab 1 title')).toHaveProperty('value', 'Content')
    expect(screen.getByLabelText('Tab 2 title')).toHaveProperty('value', 'Style')
    expect(screen.getByLabelText(/Section title: Media/)).toBeTruthy()
    for (const f of ['Heading', 'Description', 'Image', 'Background variant']) expect(screen.getByRole('button', { name: `Select ${f}` })).toBeTruthy()
    expect(screen.getByText(/built from the property groups/)).toBeTruthy()
    expect((await stored((await db.projects.toArray())[0].id)).dialog.components).toEqual({}) // nothing stored until an edit
  })

  it('stores the layout on the first edit, and edits the dialog title and tab titles', async () => {
    const user = userEvent.setup()
    const p = await open()
    const title = screen.getByLabelText('Dialog title')
    await user.clear(title); await user.type(title, 'Teaser card')
    await waitFor(async () => expect((await dlg(p.id)).title).toBe('Teaser card'))
    expect((await dlg(p.id)).tabs.map((t) => t.title)).toEqual(['Content', 'Style', 'Properties']) // whole layout kept
    const tab = screen.getByLabelText('Tab 2 title')
    await user.clear(tab); await user.type(tab, 'Appearance')
    await waitFor(async () => expect((await dlg(p.id)).tabs[1].title).toBe('Appearance'))
    expect(screen.queryByText(/built from the property groups/)).toBeNull()
  })

  it('adds, reorders and removes tabs; the last tab cannot be removed; removed tabs keep their fields', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Add tab' }))
    await waitFor(async () => expect((await dlg(p.id)).tabs).toHaveLength(4))
    await user.click(await screen.findByRole('button', { name: 'Move tab New tab up' }))
    await waitFor(async () => expect((await dlg(p.id)).tabs.map((t) => t.title)).toEqual(['Content', 'Style', 'New tab', 'Properties']))
    await user.click(await screen.findByRole('button', { name: 'Remove tab Style' }))
    await waitFor(async () => expect((await dlg(p.id)).tabs.map((t) => t.title)).toEqual(['Content', 'New tab', 'Properties']))
    const all = (await stored(p.id)).components[0].properties.map((x) => x.id)
    expect(placedIds(await dlg(p.id)).sort()).toEqual(all.sort())
  })

  it('adds a section and removes it while keeping its fields', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(await screen.findByRole('button', { name: /Remove section Media/ }))
    await waitFor(async () => expect((await dlg(p.id)).tabs[0].items.every((i) => i.kind === 'field')).toBe(true))
    await user.click(within(await screen.findByRole('region', { name: 'Tab Content' })).getByRole('button', { name: 'Add section' }))
    await waitFor(async () => expect((await dlg(p.id)).tabs[0].items.some((i) => i.kind === 'section')).toBe(true))
    expect(await screen.findByLabelText(/Section title: New section/)).toBeTruthy()
    expect(placedIds(await dlg(p.id))).toHaveLength(6)
  })

  it('reorders fields with the move buttons', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Move Heading down' }))
    await waitFor(async () => expect(await keys(p.id, (await dlg(p.id)).tabs[0].items.filter((i) => i.kind === 'field').map((i) => i.id))).toEqual(['description', 'heading']))
    expect((screen.getByRole('button', { name: 'Move Description up' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('adds a field: creates a property, places it where asked and selects it', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Add field to Media' }))
    await waitFor(async () => expect((await stored(p.id)).components[0].properties).toHaveLength(7))
    const added = (await stored(p.id)).components[0].properties.at(-1)!
    expect(added).toMatchObject({ label: 'New field', key: 'newField', origin: { kind: 'manual' } })
    const media = (await dlg(p.id)).tabs[0].items.find((i) => i.kind === 'section')!
    expect(media.kind === 'section' && media.fieldIds.at(-1)).toBe(added.id)
    expect(await screen.findByRole('heading', { name: 'New field' })).toBeTruthy()
    expect(within(screen.getByLabelText('Location in the dialog') as HTMLElement).getByRole('option', { name: 'Content › Media', selected: true })).toBeTruthy()
  })

  it('moves a field to another tab or section from its location menu', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Select Heading' }))
    await user.selectOptions(await screen.findByLabelText('Location in the dialog'), 'Style')
    await waitFor(async () => {
      const style = (await dlg(p.id)).tabs.find((t) => t.title === 'Style')!
      expect(await keys(p.id, style.items.filter((i) => i.kind === 'field').map((i) => i.id))).toEqual(['backgroundVariant', 'heading'])
    })
  })

  it('removes a field from the dialog without deleting the property, and adds it back', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Select Alignment' }))
    await user.click(await screen.findByRole('button', { name: /Remove from dialog/ }))
    await waitFor(async () => expect((await dlg(p.id)).excluded).toHaveLength(1))
    expect((await stored(p.id)).components[0].properties).toHaveLength(6)
    const region = await screen.findByRole('region', { name: 'Not in the dialog' })
    await user.click(within(region).getByRole('button', { name: /Add Alignment to the dialog/ }))
    await waitFor(async () => expect((await dlg(p.id)).excluded).toEqual([]))
    expect(placedIds(await dlg(p.id))).toHaveLength(6)
  })

  it('configures the selected field in the right-hand panel', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Select Heading' }))
    const panel = await screen.findByRole('region', { name: 'Field configuration' })
    expect(within(panel).getByText('granite/ui/components/coral/foundation/form/textfield')).toBeTruthy()
    const label = within(panel).getByLabelText('Field label')
    await user.clear(label); await user.type(label, 'Title')
    await waitFor(async () => expect((await stored(p.id)).mappings[0].overrides.label).toBe('Title'))
    expect(await screen.findByRole('button', { name: 'Select Title' })).toBeTruthy()
    expect(within(panel).queryByLabelText('Starting group')).toBeNull() // location is edited in the dialog, not as a group string
    expect(within(panel).getByRole('region', { name: 'Validation' })).toBeTruthy()
  })

  it('places properties added later automatically, by group', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Move Heading down' })) // store the layout
    await waitFor(async () => expect(Object.keys((await stored(p.id)).dialog.components)).toHaveLength(1))
    await mutateProject(p.id, (x) => ({ ...x, components: x.components.map((c) => ({ ...c, properties: [...c.properties, { ...c.properties[0], id: 'late-1', key: 'lateStyle', label: 'Late style', group: 'Style' }] })) }))
    expect(await screen.findByRole('button', { name: 'Select Late style' })).toBeTruthy()
    const style = within(screen.getByRole('region', { name: 'Tab Style' }))
    expect(style.getByRole('button', { name: 'Select Late style' })).toBeTruthy()
  })

  it('rebuilds from groups after confirmation and shows problems for empty tabs and titles', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Add tab' }))
    expect((await screen.findAllByText(/The tab "New tab" has no fields/)).length).toBeGreaterThan(0)
    const t = screen.getByLabelText('Tab 4 title')
    await user.clear(t)
    expect((await screen.findAllByText('A tab needs a title.')).length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: /Dialog.*to fix/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Rebuild from groups/ }))
    await user.click(await screen.findByRole('button', { name: 'Rebuild' }))
    await waitFor(async () => expect((await stored(p.id)).dialog.components).toEqual({}))
    expect(await screen.findByText(/built from the property groups/)).toBeTruthy()
  })

  it('exposes drag handles with keyboard instructions', async () => {
    await open()
    expect(screen.getByRole('button', { name: /Reorder Heading\. Press space/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reorder section Media\. Press space/ })).toBeTruthy()
  })

  it('removes the stored dialog when its component is deleted', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Move Heading down' }))
    await waitFor(async () => expect(Object.keys((await stored(p.id)).dialog.components)).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: /Delete component Card/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await stored(p.id)).dialog.components).toEqual({}))
  })
})
