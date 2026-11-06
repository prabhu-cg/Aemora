import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../App'
import { db } from '../projects/db'
import { ProjectSchema } from '../projects/schema'
import { resolveComponent } from '../mapping/engine'
import { resolveDialog } from '../dialog/ops'
import { generateXml } from '../xml/build'
import { checkAem, checkGenerator, parseXml } from '../xml/validate'
import { sampleProject } from './sample'

// Controls disabled through a parent <fieldset> do not report .disabled in jsdom, but they match :disabled, as in a browser.
const off = (el: Element) => el.matches(':disabled')

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

describe('sample project data', () => {
  const p = sampleProject()
  it('is a valid project with five named components', () => {
    expect(ProjectSchema.safeParse(p).success).toBe(true)
    expect(p.components.map((c) => c.name)).toEqual(['Button', 'Card', 'Image', 'Text', 'Container'])
    expect(p.components.map((c) => c.type)).toEqual(['button', 'card', 'image', 'text', 'container'])
  })
  it('is stable: the same object and the same ids every time', () => {
    expect(sampleProject()).toBe(p)
    expect(p.components[1].properties[0].id).toBe('card-heading')
  })
  it('shows the interesting features: nested exposure, reference, unsupported, composite multifield, switch, fileupload', () => {
    const [, card, image, , container] = p.components
    expect(card.children[0]).toMatchObject({ approach: 'expose-properties', exposedKeys: ['label', 'link', 'variant'] })
    expect(container.children[0].approach).toBe('reference-component')
    expect(container.unsupported).toHaveLength(1)
    const field = (c: typeof card, key: string) => resolveComponent(c, p.mappings).find((f) => f.key === key)!
    expect(field(card, 'showDescription').fieldType).toBe('switch')
    expect(field(image, 'asset').fieldType).toBe('fileupload')
    expect(field(container, 'links').multifield?.composite).toBe(true)
    expect(field(container, 'links').multifield?.subfields.map((s) => s.key)).toEqual(['label', 'url', 'newTab'])
    expect(field(card, 'heading').constraints.maxlength).toBe(60)
  })
  it('has a hand-arranged dialog for Card (tabs and a Media section) and derived ones for the rest', () => {
    const card = p.components[1]
    const d = resolveDialog(card, p.dialog.components[card.id])
    expect(d.tabs.map((t) => t.title)).toEqual(['Content', 'Style'])
    expect(d.tabs[0].items.some((i) => i.kind === 'section' && i.title === 'Media')).toBe(true)
    expect(Object.keys(p.dialog.components)).toEqual([card.id])
  })
  it.each(['Button', 'Card', 'Image', 'Text', 'Container'])('%s generates clean XML: well-formed, no structural problems, no generator errors', (name) => {
    const c = p.components.find((x) => x.name === name)!
    const fields = resolveComponent(c, p.mappings)
    const dialog = resolveDialog(c, p.dialog.components[c.id])
    const xml = generateXml({ component: c, dialog, fields, projectName: p.name })
    const { doc, result } = parseXml(xml)
    expect(result.ok).toBe(true)
    expect(checkAem(doc!)).toEqual([])
    expect(checkGenerator(c, dialog, fields, true).filter((i) => i.level === 'error')).toEqual([])
  })
})

describe('sample project page', () => {
  const open = async () => {
    render(<MemoryRouter initialEntries={['/app/sample']}><AppRoutes /></MemoryRouter>)
    await screen.findByRole('list', { name: /Properties of/ })
  }

  it('says it is read-only, hides the import area and lists the five components', async () => {
    await open()
    expect(screen.getByRole('note').textContent).toMatch(/Read-only sample/)
    expect(screen.queryByRole('button', { name: 'Bring in a design' })).toBeNull()
    const nav = screen.getByRole('navigation', { name: 'Components' })
    expect(within(nav).getAllByRole('button').map((b) => b.textContent!.replace(/\d+$/, ''))).toEqual(['Button', 'Card', 'Image', 'Text', 'Container'])
  })

  it('disables every way of changing the component', async () => {
    await open()
    expect((screen.getByLabelText('Component name') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByLabelText('Type') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Add property' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Delete component/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Move Label down' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Reorder Label/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Standard button properties/ })).toBeNull()
  })

  it('still lets you open a property to read it, with its fields disabled', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Label' }))
    const panel = await screen.findByRole('complementary', { name: /^Property:/ })
    expect(off(within(panel).getByLabelText('Label'))).toBe(true)
    expect((within(panel).getByLabelText('Label') as HTMLInputElement).value).toBe('Label')
    expect(off(within(panel).getByRole('button', { name: /Remove property/ }))).toBe(true)
  })

  it('AEM fields: types are visible and cannot be changed', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(within(screen.getByRole('navigation', { name: 'Components' })).getByRole('button', { name: /^Card/ }))
    await user.click(screen.getByRole('tab', { name: /AEM fields/ }))
    const sel = await screen.findByLabelText('AEM field type for Show description')
    expect((sel as HTMLSelectElement).value).toBe('switch')
    expect((sel as HTMLSelectElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Configure Heading' }))
    const panel = await screen.findByRole('complementary', { name: /^Field:/ })
    expect(within(panel).getByText('granite/ui/components/coral/foundation/form/textfield')).toBeTruthy()
    expect(off(within(panel).getByLabelText('Maximum length'))).toBe(true)
    expect((within(panel).getByLabelText('Maximum length') as HTMLInputElement).value).toBe('60')
  })

  it('Dialog: shows the hand-arranged Card layout, with every editing control off', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(within(screen.getByRole('navigation', { name: 'Components' })).getByRole('button', { name: /^Card/ }))
    await user.click(screen.getByRole('tab', { name: /^Dialog/ }))
    expect((await screen.findByLabelText('Tab 1 title') as HTMLInputElement).value).toBe('Content')
    expect(screen.getByLabelText(/Section title: Media/)).toBeTruthy()
    expect((screen.getByLabelText('Tab 1 title') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByRole('button', { name: 'Add tab' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Move Heading down' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Rebuild from groups/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Select Heading' }))
    expect((await screen.findByLabelText('Location in the dialog') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Remove from dialog/ })).toBeNull()
  })

  it('Preview still works as a demo, and XML is read-only', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    const heading = await screen.findByLabelText(/^Label/)
    await user.clear(heading); await user.type(heading, 'Try it')
    expect((heading as HTMLInputElement).value).toBe('Try it')
    await user.click(screen.getByRole('tab', { name: 'XML' }))
    const editor = await screen.findByRole('textbox', { name: /dialog XML/i })
    expect((editor as HTMLTextAreaElement).readOnly).toBe(true)
    expect(off(screen.getByLabelText('Edit XML'))).toBe(true)
    expect(off(screen.getByRole('button', { name: 'Regenerate' }))).toBe(true)
    expect((editor as HTMLTextAreaElement).value).toContain('sling:resourceType="cq/gui/components/authoring/dialog"')
  })

  it('writes nothing to storage, however much you click around', async () => {
    const user = userEvent.setup()
    await open()
    for (const t of [/AEM fields/, /^Dialog/, 'Preview', 'XML']) await user.click(screen.getByRole('tab', { name: t }))
    expect(await db.projects.count()).toBe(0)
    expect(await db.previous.count()).toBe(0)
  })

  it('"Make my own copy" saves an editable project and opens it', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: /Make my own copy/ }))
    await waitFor(async () => expect(await db.projects.count()).toBe(1))
    const copy = (await db.projects.toArray())[0]
    expect(copy.id).not.toBe('sample')
    expect(copy.name).toBe('Component library (from the sample)')
    expect(copy.components).toHaveLength(5)
    expect(await screen.findByRole('button', { name: 'Bring in a design' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Add property' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('note')).toBeNull()
  })
})

describe('Projects page entry', () => {
  it('offers the sample even with no projects, and opens it', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/app']}><AppRoutes /></MemoryRouter>)
    const section = await screen.findByRole('region', { name: 'Sample project' })
    expect(section.textContent).toMatch(/Read-only/)
    await user.click(within(section).getByRole('link', { name: 'Open the sample' }))
    expect(await screen.findByRole('heading', { name: 'Sample: component library' })).toBeTruthy()
  })
})
