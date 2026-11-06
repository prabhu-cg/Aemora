import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { applyImport } from '../../inputs/apply'
import { parseComponentJson } from '../../inputs/json'

const samples = import.meta.glob('../../inputs/samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sample = (n: string) => samples[`../../inputs/samples/${n}.json`]

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

async function open(names: string[] = ['button']) {
  const p = await createProject({ name: 'Teaser' })
  await mutateProject(p.id, (x) => names.reduce((acc, n) => applyImport(acc, parseComponentJson(sample(n))).project, x))
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('list', { name: /Properties of/ })
  await userEvent.setup().click(screen.getByRole('tab', { name: /AEM fields/ }))
  await screen.findByRole('list', { name: /AEM fields for/ })
  return p
}
const stored = async (id: string) => (await db.projects.get(id))!
const typeSelect = (label: string) => screen.getByLabelText(`AEM field type for ${label}`) as HTMLSelectElement
const panelOf = () => screen.findByRole('complementary', { name: /^Field:/ })

describe('AEM fields view', () => {
  it('shows a suggested Granite field for every property', async () => {
    await open()
    const expected: Record<string, string> = { Label: 'textfield', Size: 'select', Variant: 'select', State: 'select', 'Icon position': 'select', 'Icon reference': 'pathfield', 'Accessibility label': 'textfield', Link: 'pathfield' }
    for (const [label, type] of Object.entries(expected)) expect(typeSelect(label).value).toBe(type)
    expect(screen.getAllByText('(suggested)', { exact: false }).length).toBeGreaterThan(0)
  })

  it('lets any suggestion be changed inline, remembers it, and marks it edited', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.selectOptions(typeSelect('Label'), 'textarea')
    await waitFor(async () => expect((await stored(p.id)).mappings[0]).toMatchObject({ fieldType: 'textarea', manual: true }))
    expect(await screen.findByText('edited')).toBeTruthy()
    await user.selectOptions(typeSelect('Label'), 'textfield') // back to the suggestion
    await waitFor(async () => expect((await stored(p.id)).mappings).toEqual([]))
  })

  it('warns when a choice does not fit the property type', async () => {
    const user = userEvent.setup()
    await open()
    await user.selectOptions(typeSelect('Accessibility label'), 'datepicker')
    expect((await screen.findAllByText(/usually edited with a Textfield or Textarea/)).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Configure Accessibility label' }))
    expect((await within(await panelOf()).findAllByText(/Datepicker may not fit/)).length).toBeGreaterThan(0)
  })

  it('opens a panel showing the Granite resource type, and edits label, name and required', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Configure Label' }))
    const panel = await panelOf()
    expect(within(panel).getByText('granite/ui/components/coral/foundation/form/textfield')).toBeTruthy()
    const label = within(panel).getByLabelText('Field label')
    await user.clear(label); await user.type(label, 'Button text')
    await user.click(within(panel).getByLabelText('Required'))
    const name = within(panel).getByLabelText('Field name')
    await user.clear(name); await user.type(name, './cta/label')
    await waitFor(async () => expect((await stored(p.id)).mappings[0].overrides).toMatchObject({ label: 'Button text', name: './cta/label' }))
    // The design property itself is untouched.
    expect((await stored(p.id)).components[0].properties[0]).toMatchObject({ label: 'Label', key: 'label' })
    await user.clear(name); await user.type(name, 'bad name')
    expect((await within(panel).findAllByText(/must look like \.\/myField/)).length).toBeGreaterThan(0)
  })

  it('reset to suggestion removes every change for that field', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.selectOptions(typeSelect('Link'), 'textfield')
    await user.click(screen.getByRole('button', { name: 'Configure Link' }))
    const panel = await panelOf()
    const reset = within(panel).getByRole('button', { name: /Reset to suggestion/ }) as HTMLButtonElement
    await waitFor(() => expect(reset.disabled).toBe(false))
    await user.click(reset)
    await waitFor(async () => expect((await stored(p.id)).mappings).toEqual([]))
    await waitFor(() => expect(typeSelect('Link').value).toBe('pathfield'))
  })

  it('reports constraints that no longer apply when the type changes', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Configure Link' }))
    const panel = await panelOf()
    const root = within(panel).getByLabelText('Root path')
    await user.type(root, '/content/site')
    await waitFor(async () => expect((await stored(p.id)).mappings[0].constraints.rootPath).toMatch(/\/content\/site/))
    await user.selectOptions(within(panel).getByLabelText('AEM field type'), 'textfield')
    expect(await within(panel).findByText(/were removed: rootPath/)).toBeTruthy()
  })

  it('says when a design default could not be carried over to the chosen field', async () => {
    const user = userEvent.setup()
    await open(['card'])
    await user.selectOptions(typeSelect('Show description'), 'numberfield')
    await user.click(screen.getByRole('button', { name: 'Configure Show description' }))
    const panel = await panelOf()
    expect(await within(panel).findByText(/was not carried over/)).toBeTruthy()
  })

  it('flags a select with no choices on the row and fixes it from the panel', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.selectOptions(typeSelect('Label'), 'select')
    expect((await screen.findAllByText(/A select needs at least one choice/)).length).toBeGreaterThan(0) // on the row, and in the Export list below
    expect(screen.getByRole('tab', { name: /AEM fields.*to fix/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Configure Label' }))
    const panel = await panelOf()
    await user.type(within(panel).getByLabelText('Allowed values'), 'one{Enter}two')
    await waitFor(async () => expect((await stored(p.id)).mappings[0].overrides.allowedValues).toEqual(['one', 'two']))
    await waitFor(() => expect(within(panel).queryByText(/needs at least one choice/)).toBeNull())
    await within(panel).findByRole('option', { name: 'two' })
    await user.selectOptions(within(panel).getByLabelText('Default value'), 'two')
    await waitFor(async () => expect((await stored(p.id)).mappings[0].overrides.defaultValue).toBe('two'))
  })

  it('makes a field conditional from the panel: pick the controlling field, and a value for a select', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('button', { name: 'Configure Label' }))
    const panel = await panelOf()
    const when = within(panel).getByLabelText('Show this field only when') as HTMLSelectElement
    expect(within(panel).getByText(/Export ZIP includes a small clientlib/)).toBeTruthy()
    expect([...when.options].map((o) => o.textContent)).toEqual(['Always shown', 'Size', 'Variant', 'State', 'Icon position']) // selects only: Button has no checkbox
    await user.selectOptions(when, 'Variant')
    await waitFor(async () => expect((await stored(p.id)).mappings[0].overrides.showWhen).toMatchObject({ value: expect.any(String) }))
    await user.selectOptions(await within(panel).findByLabelText('has the value'), 'secondary')
    await waitFor(async () => expect((await stored(p.id)).mappings[0].overrides.showWhen?.value).toBe('secondary'))
    expect(await screen.findByText('Shown when Variant is secondary')).toBeTruthy()
    await user.selectOptions(within(panel).getByLabelText('Show this field only when'), '')
    await waitFor(async () => expect((await stored(p.id)).mappings).toEqual([]))
  })

  it('offers to make "left icon" appear only with "show icon left", and applies it on request', async () => {
    const user = userEvent.setup()
    const p = await createProject({ name: 'Teaser' })
    await mutateProject(p.id, (x) => applyImport(x, parseComponentJson(JSON.stringify({ schema: 'aemora.components/v1', components: [{ name: 'Btn', properties: [
      { name: 'show icon left', type: 'boolean' }, { name: 'left icon', type: 'enum', values: ['1', '2'] }, { name: 'Label' }] }] }))).project)
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    await user.click(await screen.findByRole('tab', { name: /AEM fields/ }))
    const box = await screen.findByRole('region', { name: 'Suggested show-only-when rules' })
    expect(box.textContent).toMatch(/always visible/)
    await user.click(within(box).getByRole('button', { name: 'Show left icon only when show icon left is checked' }))
    await waitFor(async () => expect((await stored(p.id)).mappings[0].overrides.showWhen).toBeTruthy())
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Suggested show-only-when rules' })).toBeNull())
    expect(await screen.findByText('Shown when show icon left is checked')).toBeTruthy()
  })

  it('builds a composite multifield for repeated links with named item fields', async () => {
    const user = userEvent.setup()
    const p = await open(['container'])
    await user.click(screen.getByRole('button', { name: 'Configure Links' }))
    const panel = await panelOf()
    expect(within(panel).getByText('granite/ui/components/coral/foundation/form/multifield')).toBeTruthy()
    await user.click(within(panel).getByLabelText(/Each item has several fields/))
    await waitFor(async () => expect((await stored(p.id)).mappings[0].multifield!.subfields.map((s) => s.key)).toEqual(['label', 'link']))
    expect(await within(panel).findByLabelText('Item field 2 type')).toBeTruthy()
    await user.click(within(panel).getByRole('button', { name: /Add field to each item/ }))
    await waitFor(async () => expect((await stored(p.id)).mappings[0].multifield!.subfields).toHaveLength(3))
    await user.click(await within(panel).findByRole('button', { name: 'Remove item field 3' }))
    await user.click(await within(panel).findByRole('button', { name: 'Remove item field 2' }))
    await user.click(await within(panel).findByRole('button', { name: 'Remove item field 1' }))
    expect((await within(panel).findAllByText(/needs at least one field per item/)).length).toBeGreaterThan(0)
  })

  it('flags two fields that save to the same name', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Configure Size' }))
    const panel = await panelOf()
    const name = within(panel).getByLabelText('Field name')
    await user.clear(name); await user.type(name, './label')
    expect((await screen.findAllByText(/also saves to \.\/label/)).length).toBeGreaterThan(1)
  })

  it('drops the mapping when its property is removed', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.selectOptions(typeSelect('Link'), 'textfield')
    await waitFor(async () => expect((await stored(p.id)).mappings).toHaveLength(1))
    await user.click(screen.getByRole('tab', { name: 'Properties' }))
    await user.click(screen.getByRole('button', { name: 'Edit Link' }))
    await user.click(within(await screen.findByRole('complementary', { name: /^Property:/ })).getByRole('button', { name: /Remove property/ }))
    await waitFor(async () => expect((await stored(p.id)).mappings).toEqual([]))
  })

  it('resets all fields of the component', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.selectOptions(typeSelect('Label'), 'textarea')
    await user.selectOptions(typeSelect('Link'), 'textfield')
    await waitFor(async () => expect((await stored(p.id)).mappings).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: /Reset all to suggestions \(2\)/ }))
    await waitFor(async () => expect((await stored(p.id)).mappings).toEqual([]))
  })
})
