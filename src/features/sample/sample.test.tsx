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
import { generateMarkup } from '../markup'
import { readDesign } from '../markup/layers'
import { validateMarkup } from '../markup/validate'
import { suggestShowWhen } from '../mapping/showhide'

// Controls disabled through a parent <fieldset> do not report .disabled in jsdom, but they match :disabled, as in a browser.
const off = (el: Element) => el.matches(':disabled')

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

describe('sample project data', () => {
  const p = sampleProject()
  it('is a valid project with seven named components', () => {
    expect(ProjectSchema.safeParse(p).success).toBe(true)
    expect(p.components.map((c) => c.name)).toEqual(['Button', 'Card', 'Image', 'Text', 'Container', 'Accordion', 'Tabs'])
    expect(p.components.map((c) => c.type)).toEqual(['button', 'card', 'image', 'text', 'container', 'custom', 'custom'])
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
  it('gives every component real layers', () => {
    expect(p.components.map((c) => !!readDesign(c)?.tree)).toEqual(p.components.map(() => true))
  })
  it('lets every sample value drive something: each text, option and switch is in the markup, bar the behaviour-only ones', () => {
    const behaviourOnly = new Set(['allowMultiple', 'accessibilityLabel'])
    for (const c of p.components) {
      const html = generateMarkup(c).files[0].content
      for (const prop of c.properties.filter((x) => ['string', 'text', 'richtext', 'enum', 'boolean'].includes(x.type) && !behaviourOnly.has(x.key))) {
        expect(html, `${c.name}: ${prop.label}`).toContain(prop.type === 'enum' ? `model.${prop.key}Modifier` : `model.${prop.key}`)
      }
    }
  })
  it('every change a variant makes points at a layer that exists', () => {
    const resolves = (tree: NonNullable<ReturnType<typeof readDesign>>['tree'], path: string) => {
      const [root, ...rest] = path.split('/')
      let node = tree?.name === root ? tree : undefined
      for (const name of rest) node = node?.children?.find((c) => c.name === name)
      return !!node
    }
    for (const c of p.components) {
      const d = readDesign(c)!
      for (const v of d.variantDiffs) for (const l of v.layers) expect(resolves(d.tree, l.path), `${c.name}: ${l.path}`).toBe(true)
    }
  })
  it.each(['Button', 'Card', 'Image', 'Text', 'Container', 'Accordion', 'Tabs'])('%s generates real markup: HTL, CSS with options and states, and no problems', (name) => {
    const c = p.components.find((x) => x.name === name)!
    const m = generateMarkup(c)
    expect(m.fallback).toBe(false)
    expect(validateMarkup(m)).toEqual([])
    expect(m.notes.filter((n) => n.level === 'warning')).toEqual([])
    const css = m.files[1].content
    if (['Button', 'Card', 'Accordion'].includes(name)) expect(css).toContain(`.cmp-${name.toLowerCase()}:hover`)
    // Each option has its own rules, for the look it gives.
    expect(css).toMatch(new RegExp(`\\.cmp-${name.toLowerCase()}--[a-z0-9-]+ `))
  })
  it('draws the pill tabs with only the active tab raised, whichever tab is active', () => {
    const tabs = p.components.find((c) => c.name === 'Tabs')!
    const rules = generateMarkup(tabs).files[1].content.split('\n\n')
    const rule = (sel: string) => rules.find((r) => r.startsWith(sel))
    // Tab 2 active in the pill look: tab 1 has no underline or shadow left over from the line look, and tab 2 is the white pill.
    expect(rule('.cmp-tabs--style-pill.cmp-tabs--active-tab-2 .cmp-tabs__tab-1 {')).toMatch(/box-shadow: none/)
    expect(rule('.cmp-tabs--style-pill.cmp-tabs--active-tab-2 .cmp-tabs__tab-2 {')).toMatch(/background-color: #ffffff/)
  })
  it('binds the card\'s image description and button link, and the button\'s icon position', () => {
    const [button, card] = p.components
    const html = generateMarkup(card).files[0].content
    expect(html).toContain('alt="${model.imageAlt}"')
    expect(html).toContain('href="${model.ctaLink}"')
    expect(generateMarkup(button).files[1].content).toMatch(/--icon-position-left \.cmp-button__icon-left \{\s*display: block/)
  })
  it('suggests showing the card\'s description only while "Show description" is on, from the design', () => {
    const card = p.components[1]
    const s = suggestShowWhen(resolveComponent(card, p.mappings), card)
    expect(s.map((x) => [x.controllerLabel, x.targetLabel, x.source])).toEqual([['Show description', 'Description', 'design']])
  })
  it.each(['Button', 'Card', 'Image', 'Text', 'Container', 'Accordion', 'Tabs'])('%s generates clean XML: well-formed, no structural problems, no generator errors', (name) => {
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

  it('says it is read-only, hides the import area and lists the seven components', async () => {
    await open()
    expect(screen.getByRole('note').textContent).toMatch(/Read-only sample/)
    expect(screen.queryByRole('button', { name: 'Bring in a design' })).toBeNull()
    const nav = screen.getByRole('navigation', { name: 'Components' })
    expect(within(nav).getAllByRole('button').map((b) => b.textContent!.replace(/\d+$/, ''))).toEqual(['Button', 'Card', 'Image', 'Text', 'Container', 'Accordion', 'Tabs'])
  })

  it('disables every way of changing the component', async () => {
    await open()
    expect((screen.getByLabelText('Component name') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByLabelText('Type') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Add property' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Delete component/ })).toBeNull() // no delete icons at all in the read-only sample
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

  it('opens the preview on the component, for every component', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(await screen.findByRole('region', { name: 'Component preview' })).toBeTruthy()
    expect(screen.queryByText(/This preview is not the design/)).toBeNull()
    for (const name of [/^Image/, /^Accordion/, /^Tabs/]) {
      await user.click(screen.getByRole('button', { name }))
      expect(await screen.findByRole('region', { name: 'Component preview' })).toBeTruthy()
      expect(screen.queryByText(/This preview is not the design/)).toBeNull()
    }
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
    expect(copy.components).toHaveLength(7)
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
