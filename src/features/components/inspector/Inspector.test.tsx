import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { applyImport } from '../../inputs/apply'
import { parseComponentJson } from '../../inputs/json'
import { makeProperty } from '../factory'

const samples = import.meta.glob('../../inputs/samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sample = (n: string) => samples[`../../inputs/samples/${n}.json`]

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

async function open(names: string[] = ['button']) {
  const p = await createProject({ name: 'Teaser' })
  await mutateProject(p.id, (x) => names.reduce((acc, n) => applyImport(acc, parseComponentJson(sample(n))).project, x))
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('list', { name: /Properties of/ })
  return p
}
const stored = async (id: string) => (await db.projects.get(id))!
const first = async (id: string, i = 0) => (await stored(id)).components[i]
const panelOf = () => screen.findByRole('complementary', { name: /^Property:/ })

describe('property inspector', () => {
  it('opens a right-side panel for a property and saves renames of label and field name', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Edit Label' }))
    const panel = await screen.findByRole('complementary', { name: 'Property: Label' })
    const label = within(panel).getByLabelText('Label')
    await user.clear(label); await user.type(label, 'Button text')
    const key = within(panel).getByLabelText('Field name')
    await user.clear(key); await user.type(key, 'buttonText')
    await waitFor(async () => expect((await first(p.id)).properties[0]).toMatchObject({ label: 'Button text', key: 'buttonText' }))
    expect(await screen.findByRole('button', { name: 'Edit Button text' })).toBeTruthy()
  })

  it('changes type to enum with allowed values and a default, and flags a default outside the list', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Edit Link' }))
    const panel = await panelOf()
    await user.selectOptions(within(panel).getByLabelText('Type'), 'enum')
    const values = await within(panel).findByLabelText('Allowed values')
    await user.type(values, 'self{Enter}blank')
    await user.selectOptions(within(panel).getByLabelText('Default value'), 'blank')
    await waitFor(async () => expect((await first(p.id)).properties[7]).toMatchObject({ type: 'enum', allowedValues: ['self', 'blank'], defaultValue: 'blank' }))
    await user.clear(values); await user.type(values, 'self')
    expect(await within(panel).findByText(/not one of the allowed values/)).toBeTruthy()
  })

  it('sets required, description and group, and typed defaults with a clear error', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Edit Accessibility label' }))
    const panel = await panelOf()
    await user.click(within(panel).getByLabelText('Required'))
    await user.type(within(panel).getByLabelText('Group'), 'Accessibility')
    const desc = within(panel).getByLabelText('Description')
    await user.clear(desc); await user.type(desc, 'Read by screen readers')
    await waitFor(async () => expect((await first(p.id)).properties[6]).toMatchObject({ required: true, group: 'Accessibility', description: 'Read by screen readers' }))
    expect(await screen.findByText(/Groups: .*Accessibility/)).toBeTruthy()
    await user.selectOptions(within(panel).getByLabelText('Type'), 'number')
    await user.type(within(panel).getByLabelText('Default value'), '3')
    await waitFor(async () => expect((await first(p.id)).properties[6].defaultValue).toBe(3))
  })

  it('reorders with the move buttons and exposes an accessible drag handle', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Move Label down' }))
    await waitFor(async () => expect((await first(p.id)).properties.slice(0, 2).map((x) => x.key)).toEqual(['size', 'label']))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Move Size up' }) as HTMLButtonElement).disabled).toBe(true))
    // Keyboard dragging needs real layout, which jsdom lacks; the handle exposes its instructions instead.
    expect(screen.getByRole('button', { name: /Reorder Label\. Press space/ })).toBeTruthy()
  })

  it('removes a property and brings it back with Undo, in its old position', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Edit Size' }))
    await user.click(within(await panelOf()).getByRole('button', { name: /Remove property/ }))
    await waitFor(async () => expect((await first(p.id)).properties.map((x) => x.key)).not.toContain('size'))
    await waitFor(() => expect(screen.queryByRole('complementary', { name: /^Property:/ })).toBeNull())
    await user.click(await screen.findByRole('button', { name: /Undo/ }))
    await waitFor(async () => expect((await first(p.id)).properties.map((x) => x.key).slice(0, 3)).toEqual(['label', 'size', 'variant']))
  })

  it('adds a property by hand and opens it for editing', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Add property' }))
    expect(await screen.findByRole('complementary', { name: 'Property: New property' })).toBeTruthy()
    await waitFor(async () => expect((await first(p.id)).properties.at(-1)).toMatchObject({ key: 'newProperty', origin: { kind: 'manual' } }))
  })

  it('shows duplicate field names as an error on the row and in the panel', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Size' }))
    const panel = await panelOf()
    const key = within(panel).getByLabelText('Field name')
    await user.clear(key); await user.type(key, 'label')
    expect((await within(panel).findByText(/also named "label"/))).toBeTruthy()
    expect(screen.getAllByText(/also named "label"/).length).toBeGreaterThan(1)
    expect(screen.getByText(/to fix/, { selector: 'span[role="status"]' })).toBeTruthy()
  })

  it('closes the panel with Escape and the close button', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Label' }))
    await panelOf()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('complementary', { name: /^Property:/ })).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Edit Label' }))
    await user.click(within(await panelOf()).getByRole('button', { name: 'Close panel' }))
    await waitFor(() => expect(screen.queryByRole('complementary', { name: /^Property:/ })).toBeNull())
  })

  it('offers standard properties for the type and adds only the chosen ones', async () => {
    const user = userEvent.setup()
    const p = await open(['card'])
    await user.click(screen.getByRole('button', { name: /Standard card properties/ }))
    await user.click(screen.getByLabelText(/CTA label/))
    await user.click(screen.getByLabelText(/CTA link/))
    await user.click(screen.getByRole('button', { name: /Add 2 selected/ }))
    await waitFor(async () => expect((await first(p.id)).properties.map((x) => x.key).slice(-2)).toEqual(['ctaLabel', 'ctaLink']))
    expect((await first(p.id)).properties.every((x) => !x.origin.suggested)).toBe(true)
  })

  it('lets you keep or remove properties suggested by detection', async () => {
    const user = userEvent.setup()
    const p = await open()
    await mutateProject(p.id, (x) => ({ ...x, components: x.components.map((c) => ({ ...c, properties: [...c.properties, makeProperty({ key: 'helperText', label: 'Helper text', origin: { kind: 'figma-rest', suggested: true } })] })) }))
    expect(await screen.findByText(/1 suggested from detection/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Keep all' }))
    await waitFor(async () => expect((await first(p.id)).properties.every((x) => !x.origin.suggested)).toBe(true))
    await mutateProject(p.id, (x) => ({ ...x, components: x.components.map((c) => ({ ...c, properties: [...c.properties, makeProperty({ key: 'extra', origin: { kind: 'figma-rest', suggested: true } })] })) }))
    await user.click(await screen.findByRole('button', { name: 'Remove all' }))
    await waitFor(async () => expect((await first(p.id)).properties.map((x) => x.key)).not.toContain('extra'))
  })

  it('turns an unsupported item into a property, or dismisses it with Undo', async () => {
    const user = userEvent.setup()
    const p = await open(['image'])
    const list = screen.getByRole('region', { name: 'Unsupported items' })
    await user.click(within(list).getByRole('button', { name: /Dismiss Focal point\.cropRatio/ }))
    await waitFor(async () => expect((await first(p.id)).unsupported).toHaveLength(0))
    await user.click(await screen.findByRole('button', { name: /Undo/ }))
    await waitFor(async () => expect((await first(p.id)).unsupported).toHaveLength(1))
    await user.click(within(await screen.findByRole('region', { name: 'Unsupported items' })).getByRole('button', { name: /Turn Focal point\.cropRatio into a property/ }))
    await waitFor(async () => {
      const c = await first(p.id)
      expect(c.unsupported).toHaveLength(0)
      expect(c.properties.at(-1)).toMatchObject({ key: 'cropRatio', defaultValue: '16:9' })
    })
    expect(await screen.findByRole('complementary', { name: 'Property: cropRatio' })).toBeTruthy()
  })

  it('records how a nested component appears in the parent dialog', async () => {
    const user = userEvent.setup()
    const p = await open(['button', 'card'])
    await user.click(within(screen.getByRole('navigation', { name: 'Components' })).getByRole('button', { name: /^Card/ }))
    const region = await screen.findByRole('region', { name: 'Nested components' })
    await user.click(within(region).getByLabelText(/Reference a component/))
    await waitFor(async () => expect((await first(p.id, 1)).children[0].approach).toBe('reference-component'))
    await user.click(within(region).getByLabelText(/Expose selected properties/))
    expect((await within(region).findAllByText(/Primary Button/)).length).toBeGreaterThan(0)
    await waitFor(async () => expect((await first(p.id, 1)).children[0].approach).toBe('expose-properties'))
  })

  it('renames and retypes the component, and deletes it after confirmation', async () => {
    const user = userEvent.setup()
    const p = await open(['button', 'text'])
    const name = screen.getByLabelText('Component name')
    await user.clear(name); await user.type(name, 'CTA')
    await waitFor(async () => expect((await first(p.id)).name).toBe('CTA'))
    await user.selectOptions(screen.getByLabelText('Type'), 'container')
    await waitFor(async () => expect((await first(p.id)).type).toBe('container'))
    await user.click(screen.getByRole('button', { name: /Delete component CTA/ }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await stored(p.id)).components.map((c) => c.name)).toEqual(['Text']))
  })

  it('does not save an error banner when a field is cleared mid-edit', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Label' }))
    const label = within(await panelOf()).getByLabelText('Label')
    await user.clear(label)
    expect(await within(screen.getByRole('complementary', { name: /^Property:/ })).findByText('Add a label authors will see.')).toBeTruthy()
    expect(screen.queryByText(/Could not save/)).toBeNull()
  })
})

describe('panel motion', () => {
  it('slides in (closed first, then open), leaves with a closed state, is inert while leaving, and keeps one shell across rows', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Label' }))
    const panel = await panelOf()
    await waitFor(() => expect(panel.getAttribute('data-state')).toBe('open'))
    expect(panel.className).toContain('slide-panel')
    expect(document.body.getAttribute('data-side-panel')).toBe('open')

    await user.click(screen.getByRole('button', { name: 'Edit Size' })) // switching rows must not remount the shell
    expect(await screen.findByRole('complementary', { name: 'Property: Size' })).toBe(panel)
    expect(panel.getAttribute('data-state')).toBe('open')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(panel.getAttribute('data-state')).toBe('closed'))
    expect(panel.hasAttribute('inert')).toBe(true)
    expect(document.body.hasAttribute('data-side-panel')).toBe(false) // page starts reclaiming its space
    await waitFor(() => expect(panel.isConnected).toBe(false))
  })
  it('can be reopened while it is still leaving', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Label' }))
    const panel = await panelOf()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Edit Link' }))
    await waitFor(() => expect(panel.getAttribute('data-state')).toBe('open'))
    expect(panel.hasAttribute('inert')).toBe(false)
    expect(panel.isConnected).toBe(true)
  })
})

describe('keyboard focus around the side panel', () => {
  it('returns focus to the row that opened the panel when it closes', async () => {
    const user = userEvent.setup()
    await open()
    const row = screen.getByRole('button', { name: 'Edit Label' })
    await user.click(row)
    await screen.findByRole('complementary', { name: /^Property:/ })
    await waitFor(() => expect(document.activeElement).not.toBe(row)) // focus moved into the form
    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.activeElement).toBe(row))
  })
})

describe('components overview', () => {
  it('lists components across projects and links to them', async () => {
    const p = await createProject({ name: 'Teaser' })
    await mutateProject(p.id, (x) => applyImport(x, parseComponentJson(sample('button'))).project)
    render(<MemoryRouter initialEntries={['/app/components']}><AppRoutes /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /Button/ })
    expect(link.getAttribute('href')).toBe(`/app/generator/${p.id}`)
    expect(screen.getByText('Teaser')).toBeTruthy()
  })
})
