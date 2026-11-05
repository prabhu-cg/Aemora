import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { makeComponent, makeProperty } from '../../components/factory'
import { patchSubfield, setConstraint, setFieldType, setMultifield } from '../../mapping/ops'
import type { Mapping } from '../../mapping/schema'

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

async function open(extra: (c: ReturnType<typeof makeComponent>) => ReturnType<typeof makeComponent> = (c) => c) {
  const props = [
    makeProperty({ key: 'heading', label: 'Heading', type: 'string', required: true, description: 'Main title', group: 'Content' }),
    makeProperty({ key: 'body', label: 'Body', type: 'text', group: 'Content' }),
    makeProperty({ key: 'count', label: 'Count', type: 'number', defaultValue: 2, group: 'Content' }),
    makeProperty({ key: 'size', label: 'Size', type: 'enum', allowedValues: ['s', 'm', 'l'], defaultValue: 'm', group: 'Style' }),
    makeProperty({ key: 'tone', label: 'Tone', type: 'enum', allowedValues: ['warm', 'cool'], group: 'Style' }),
    makeProperty({ key: 'showIt', label: 'Show it', type: 'boolean', defaultValue: true, group: 'Style' }),
    makeProperty({ key: 'agree', label: 'Agree', type: 'boolean', required: true, group: 'Style' }),
    makeProperty({ key: 'links', label: 'Links', type: 'list', group: 'Extra' }),
    makeProperty({ key: 'notes', label: 'Notes', type: 'list', group: 'Extra' }),
    makeProperty({ key: 'hero', label: 'Hero', type: 'image', group: 'Extra' }),
    makeProperty({ key: 'tags', label: 'Tags', type: 'tags', group: 'Extra' }),
    makeProperty({ key: 'secret', label: 'Secret', type: 'hidden', defaultValue: 'abc', group: 'Extra' }),
  ]
  const c = extra(makeComponent({ name: 'Card', type: 'card', properties: props }))
  const [, body, count, , , , agree, links] = c.properties
  let ms: Mapping[] = []
  ms = setConstraint(ms, c, body, 'maxlength', 5)
  ms = setConstraint(ms, c, count, 'min', 0); ms = setConstraint(ms, c, count, 'max', 10); ms = setConstraint(ms, c, count, 'step', 2)
  ms = setFieldType(ms, c, agree, 'switch').mappings
  ms = setMultifield(ms, c, links, { composite: true })
  ms = patchSubfield(ms, c, links, ms.find((m) => m.propertyId === links.id)!.multifield!.subfields[1].id, { key: 'url', label: 'URL' })
  const p = await createProject({ name: 'Teaser' })
  await mutateProject(p.id, (x) => ({ ...x, components: [c], mappings: ms }))
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('list', { name: /Properties of/ })
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Preview' }))
  await screen.findByRole('region', { name: 'Simulated dialog preview' })
  return { p, c }
}
const field = (name: RegExp | string) => screen.getByLabelText(name) as HTMLInputElement
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

describe('simulated dialog preview', () => {
  it('says plainly that it is a simulation, not AEM', async () => {
    await open()
    const note = screen.getByRole('note')
    expect(note.textContent).toMatch(/Simulated authoring preview/)
    expect(note.textContent).toMatch(/not a running AEM instance/)
    expect(screen.getByText('Simulated')).toBeTruthy()
  })

  it('shows the dialog title, the tabs and the fields of the Dialog view', async () => {
    await open()
    expect(screen.getByRole('heading', { name: 'Card' })).toBeTruthy()
    expect(screen.getAllByRole('tab', { name: /Content|Style|Extra/ }).map((t) => t.textContent)).toEqual(['Content', 'Style', 'Extra'])
    expect(tab('Content').getAttribute('aria-selected')).toBe('true')
    for (const l of [/^Heading/, /^Body/, /^Count/]) expect(field(l)).toBeTruthy()
    expect(screen.queryByLabelText(/^Size/)).toBeNull() // on another tab
  })

  it('marks required fields, shows descriptions and starts from defaults', async () => {
    await open()
    expect(screen.getByText('(required)')).toBeTruthy()
    expect(field(/^Heading/).getAttribute('aria-required')).toBe('true')
    expect(screen.getByText('Main title')).toBeTruthy()
    expect(field(/^Heading/).getAttribute('aria-describedby')).toBeTruthy()
    expect(field(/^Count/).value).toBe('2')
    const user = userEvent.setup()
    await user.click(tab('Style'))
    expect(field(/^Size/).value).toBe('m')
    expect(field(/^Tone/).value).toBe('') // optional, no default: empty choice
    expect(within(field(/^Tone/)).getAllByRole('option').map((o) => o.textContent)).toEqual(['Select', 'warm', 'cool'])
    expect((screen.getByLabelText(/Show it/) as HTMLInputElement).checked).toBe(true)
  })

  it('validates on blur and clears the message as soon as the value is fixed', async () => {
    const user = userEvent.setup()
    await open()
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(field(/^Heading/)); await user.tab()
    expect((await screen.findByRole('alert')).textContent).toBe('This field is required.')
    expect(field(/^Heading/).getAttribute('aria-invalid')).toBe('true')
    await user.type(field(/^Heading/), 'Hi')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('checks maximum length and number range and step', async () => {
    const user = userEvent.setup()
    await open()
    await user.type(field(/^Body/), 'toolong'); await user.tab()
    expect(await screen.findByText('Use at most 5 characters.')).toBeTruthy()
    const count = field(/^Count/)
    await user.clear(count); await user.type(count, '3'); await user.tab()
    expect(await screen.findByText('Use steps of 2.')).toBeTruthy()
    await user.clear(count); await user.type(count, '12'); await user.tab()
    expect(await screen.findByText('Enter 10 or less.')).toBeTruthy()
  })

  it('Done with problems counts them on the tabs, jumps to the first one and focuses it', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(tab('Extra'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText(/Fix 2 fields before Done will work/)).toBeTruthy()
    await waitFor(() => expect(tab('Content').getAttribute('aria-selected')).toBe('true'))
    await waitFor(() => expect(document.activeElement).toBe(field(/^Heading/)))
    expect(within(tab('Content')).getByLabelText('1 problem')).toBeTruthy()
    expect(within(tab('Style')).getByLabelText('1 problem')).toBeTruthy()
    await user.click(tab('Style'))
    expect(screen.getByText('This must be switched on.')).toBeTruthy()
  })

  it('a valid Done shows the values the dialog would save, typed, with hidden defaults', async () => {
    const user = userEvent.setup()
    await open()
    await user.type(field(/^Heading/), 'Hello')
    await user.click(tab('Style'))
    await user.click(screen.getByRole('switch', { name: /Agree/ }))
    await user.selectOptions(field(/^Tone/), 'cool')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText(/Valid\. In AEM the dialog would close/)).toBeTruthy()
    const saved = JSON.parse(screen.getByLabelText('Saved values').textContent!)
    expect(saved).toEqual({ './heading': 'Hello', './count': 2, './size': 'm', './tone': 'cool', './showIt': true, './agree': true, './secret': 'abc' })
  })

  it('does not show hidden fields, but says they exist', async () => {
    await open()
    expect(screen.queryByLabelText(/Secret/)).toBeNull()
    expect(screen.getByText(/1 hidden field is not shown to authors: \.\/secret = abc/)).toBeTruthy()
  })

  it('works a simple multifield: add, type, reorder, remove', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(tab('Extra'))
    const addButtons = screen.getAllByRole('button', { name: 'Add' })
    await user.click(addButtons[1]) // Notes (second multifield)
    await user.click(screen.getAllByRole('button', { name: 'Add' })[1])
    const items = screen.getByRole('list', { name: 'Items of Notes' })
    const boxes = within(items).getAllByRole('textbox')
    await user.type(boxes[0], 'first'); await user.type(boxes[1], 'second')
    await user.click(within(items).getByRole('button', { name: 'Move item 2 up' }))
    expect((within(items).getAllByRole('textbox') as HTMLInputElement[]).map((b) => b.value)).toEqual(['second', 'first'])
    await user.click(within(items).getByRole('button', { name: 'Remove item 1' }))
    expect((within(items).getAllByRole('textbox') as HTMLInputElement[]).map((b) => b.value)).toEqual(['first'])
  })

  it('a composite multifield shows each item as its named fields', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(tab('Extra'))
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]) // Links
    const items = screen.getByRole('list', { name: 'Items of Links' })
    await user.type(within(items).getByLabelText('Label'), 'Home')
    await user.type(within(items).getByLabelText('URL'), '/content/home')
    expect((within(items).getByLabelText('Label') as HTMLInputElement).value).toBe('Home')
    expect(within(items).getByRole('button', { name: 'Browse' })).toBeTruthy()
  })

  it('path fields offer clearly labelled sample paths; tag fields take typed tags', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(tab('Extra'))
    await user.click(screen.getAllByRole('button', { name: 'Browse' }).find((b) => b.closest('div')?.querySelector('#' + CSS.escape(field(/^Hero/).id)))!)
    expect(await screen.findByText('Sample paths (simulated)')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /\/content\/dam\/sample-site\/hero\.jpg/ }))
    expect(field(/^Hero/).value).toBe('/content/dam/sample-site/hero.jpg')
    const tags = field(/^Tags/)
    await user.type(tags, 'news{Enter}launch,')
    expect(screen.getByRole('button', { name: 'Remove news' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove launch' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove news' }))
    expect(screen.queryByRole('button', { name: 'Remove news' })).toBeNull()
  })

  it('Cancel clears what was typed', async () => {
    const user = userEvent.setup()
    await open()
    await user.type(field(/^Heading/), 'Draft')
    await user.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(field(/^Heading/).value).toBe('')
  })

  it('follows the Dialog view: renamed tabs and left-out properties show up here', async () => {
    const user = userEvent.setup()
    const { p } = await open()
    await user.click(screen.getByRole('tab', { name: /^Dialog/ }))
    const t = await screen.findByLabelText('Tab 1 title')
    await user.clear(t); await user.type(t, 'Basics')
    await user.click(screen.getByRole('button', { name: 'Select Body' }))
    await user.click(await screen.findByRole('button', { name: /Remove from dialog/ }))
    await waitFor(async () => expect(Object.values((await db.projects.get(p.id))!.dialog.components)[0].excluded).toHaveLength(1))
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(await screen.findByRole('tab', { name: 'Basics' })).toBeTruthy()
    expect(screen.queryByLabelText(/^Body/)).toBeNull()
    expect(screen.getByText(/1 property is left out of the dialog/)).toBeTruthy()
  })

  it('explains what authors will see in AEM', async () => {
    await open()
    expect(screen.getByText('What authors will see in AEM')).toBeTruthy()
  })
})
