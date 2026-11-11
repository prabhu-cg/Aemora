import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { importDesignMd, parseDesignMdText } from '../../inputs/designmd/parse'
import { makeComponent, makeProperty } from '../../components/factory'

const raw = import.meta.glob('../../../test/fixtures/designmd-rayna.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const catalog = parseDesignMdText(Object.values(raw)[0])
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

async function open(opts: { name?: string; image?: boolean; stored?: Record<string, { content: string; base: string; edited: boolean; generatedAt: string }> } = {}) {
  const c = importDesignMd(catalog, [catalog.entries.find((e) => e.name === (opts.name ?? 'Button / primary'))!.id]).components[0]
  const p = await createProject({ name: 'Acme' })
  await mutateProject(p.id, (x) => ({
    ...x,
    components: [opts.image ? { ...c, previewAssetId: 'a1' } : c],
    assets: opts.image ? [{ id: 'a1', name: 'design.png', mime: 'image/png' as const, bytes: 70, dataUrl: PNG }] : [],
    markup: opts.stored ? { [c.id]: { files: opts.stored } } : {},
  }))
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('list', { name: /Properties of/ })
  const user = userEvent.setup()
  await user.click(screen.getByRole('tab', { name: 'Preview' }))
  await user.click(screen.getByRole('button', { name: 'Component' }))
  await screen.findByRole('region', { name: 'Component preview' })
  return { p, user }
}
const frameDoc = () => (screen.getByTitle('Generated component preview') as HTMLIFrameElement).contentDocument!
/** The CSS the frame uses, whether set as adopted stylesheets (browsers) or a style element (fallback). */
const frameCss = () => {
  const d = frameDoc()
  const adopted = (d as unknown as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []
  return [...adopted.flatMap((sheet) => [...sheet.cssRules].map((r) => r.cssText)), ...[...d.querySelectorAll('style')].map((x) => x.textContent ?? '')].join('\n')
}
const root = () => frameDoc().body.firstElementChild as HTMLElement
const region = () => within(screen.getByRole('region', { name: 'Component preview' }))

const msgRaw = import.meta.glob('../../../test/fixtures/designmd-message.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('Component preview', () => {
  it('opens on the component preview, with the dialog preview a choice beside it', async () => {
    const c = importDesignMd(catalog, [catalog.entries[0].id]).components[0]
    const p = await createProject({ name: 'Acme' })
    await mutateProject(p.id, (x) => ({ ...x, components: [c] }))
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    await screen.findByRole('list', { name: /Properties of/ })
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    const [first, second] = within(screen.getByRole('group', { name: 'Preview type' })).getAllByRole('button')
    expect([first.textContent, second.textContent]).toEqual(['Component', 'Dialog'])
    expect(first.getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByRole('region', { name: 'Component preview' })).toBeTruthy()
    await user.click(second)
    expect(screen.queryByRole('region', { name: 'Component preview' })).toBeNull()
  })

  it('renders the generated component in a frame that cannot run script', async () => {
    await open()
    const frame = screen.getByTitle('Generated component preview')
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin')
    await waitFor(() => expect(root()?.tagName).toBe('BUTTON'))
    expect(root().className).toBe('cmp-button-primary cmp-button-primary--size-sm cmp-button-primary--icon-style-none')
    expect(root().textContent?.trim()).toBe('Label')
  })

  it('applies the generated CSS to what it renders', async () => {
    await open()
    await waitFor(() => expect(root()).toBeTruthy())
    const css = frameCss()
    expect(css).toContain('.cmp-button-primary {')
    expect(css).toContain('.cmp-button-primary:hover')
  })

  it('changes with the sample values', async () => {
    const { user } = await open()
    await waitFor(() => expect(root()).toBeTruthy())
    await user.selectOptions(region().getByLabelText('size'), 'lg')
    await waitFor(() => expect(root().className).toContain('cmp-button-primary--size-lg'))
    await user.selectOptions(region().getByLabelText('icon-style'), 'leading icon')
    await waitFor(() => expect(frameDoc().querySelectorAll('[data-icon]')).toHaveLength(1))
    fireEvent.change(region().getByLabelText('Label'), { target: { value: 'Buy now' } })
    await waitFor(() => expect(root().textContent).toContain('Buy now'))
  })

  it('shows hover, focus and disabled by adding a class, only for states the CSS styles', async () => {
    const { user } = await open()
    await waitFor(() => expect(root()).toBeTruthy())
    expect(region().getByRole('button', { name: 'Hover' })).toBeTruthy()
    expect(region().queryByRole('button', { name: 'Pressed' })).toBeNull()
    await user.click(region().getByRole('button', { name: 'Hover' }))
    await waitFor(() => expect(root().classList.contains('is-preview-hover')).toBe(true))
    expect(frameCss()).toContain('.cmp-button-primary.is-preview-hover')
    await user.click(region().getByRole('button', { name: 'Disabled' }))
    await waitFor(() => expect(root().getAttribute('aria-disabled')).toBe('true'))
    expect(root().classList.contains('is-preview-hover')).toBe(false)
    await user.click(region().getByRole('button', { name: 'Default' }))
    await waitFor(() => expect(root().classList.contains('is-preview-disabled')).toBe(false))
  })

  it('switches the background with an icon button', async () => {
    const { user } = await open()
    await waitFor(() => expect(root()).toBeTruthy())
    const toggle = region().getByRole('button', { name: 'Dark background' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await user.click(toggle)
    await waitFor(() => expect(frameDoc().body.classList.contains('pv-dark')).toBe(true))
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    await user.click(toggle)
    await waitFor(() => expect(frameDoc().body.classList.contains('pv-dark')).toBe(false))
  })

  it('hides the design section when there is no design picture', async () => {
    await open()
    expect(region().queryByText('Design')).toBeNull()
    expect(region().queryByText(/No picture of the design/)).toBeNull()
  })
  it('shows true size first and can be made larger with the zoom', async () => {
    const { user } = await open()
    await waitFor(() => expect(root()).toBeTruthy())
    expect((region().getByLabelText('Zoom') as HTMLSelectElement).value).toBe('1')
    expect(frameCss()).toContain('zoom: 1')
    await user.selectOptions(region().getByLabelText('Zoom'), '200%')
    await waitFor(() => expect(frameCss()).toContain('zoom: 2'))
  })

  it('uses hand edits to the HTL and says so', async () => {
    await open({ stored: { htl: { content: '<div class="mine">${model.label} edited</div>\n', base: '', edited: true, generatedAt: '2026-01-01' } } })
    await waitFor(() => expect(root()?.className).toBe('mine'))
    expect(root().textContent).toBe('Label edited')
    expect(region().getByText(/your hand edits to the HTL/)).toBeTruthy()
  })

  it('cannot be made to run script by a hand-edited file or a typed value', async () => {
    const w = window as unknown as Record<string, unknown>
    const evil = '<script>window.__pwned = 1</script><img src="x" onerror="window.__pwned = 2"><a href="javascript:window.__pwned = 3" onclick="window.__pwned = 4">x</a><p>${model.label}</p>'
    const { user } = await open({ stored: { htl: { content: evil, base: '', edited: true, generatedAt: '2026-01-01' } } })
    await waitFor(() => expect(frameDoc().querySelector('p')).toBeTruthy())
    const d = frameDoc()
    expect(d.querySelector('script')).toBeNull()
    expect(d.querySelector('img')?.getAttribute('onerror') ?? null).toBeNull()
    expect(d.querySelector('a')?.getAttribute('href') ?? null).toBeNull()
    expect(d.querySelector('a')?.getAttribute('onclick') ?? null).toBeNull()
    fireEvent.change(region().getByLabelText('Label'), { target: { value: '<script>window.__pwned = 5</script><b onmouseover="window.__pwned = 6">x</b>' } })
    await waitFor(() => expect(d.querySelector('p')?.textContent).toContain('<script>'))
    expect(d.querySelector('p script, p b')).toBeNull()
    await user.click(d.querySelector('a')!)
    expect(w.__pwned).toBeUndefined()
  })

  it('does not follow a link inside the frame', async () => {
    await open({ stored: { htl: { content: '<a class="go" href="https://example.com/">go</a>', base: '', edited: true, generatedAt: '2026-01-01' } } })
    await waitFor(() => expect(frameDoc().querySelector('a.go')).toBeTruthy())
    const e = new MouseEvent('click', { bubbles: true, cancelable: true })
    frameDoc().querySelector('a.go')!.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('lists what the preview could not do', async () => {
    await open({ stored: { htl: { content: '<ul data-sly-list="${model.x}"><li>a</li></ul>', base: '', edited: true, generatedAt: '2026-01-01' } } })
    expect((await screen.findByRole('status', { name: 'Preview limits' })).textContent).toMatch(/data-sly-list is not supported/)
  })

  it('gives long text a multi-line field, and shows empty pictures and avatars as boxes you can see', async () => {
    const cat = parseDesignMdText(Object.values(msgRaw)[0])
    const c = importDesignMd(cat, [cat.entries[0].id]).components[0]
    const p = await createProject({ name: 'Acme' })
    await mutateProject(p.id, (x) => ({ ...x, components: [c] }))
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    await screen.findByRole('list', { name: /Properties of/ })
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Component' }))
    const box = (await region().findByLabelText(/supporting text/i)) as HTMLTextAreaElement
    expect(box.tagName).toBe('TEXTAREA')
    expect(box.rows).toBeGreaterThanOrEqual(3)
    await waitFor(() => expect(frameDoc().querySelector('.cmp-message-bubbles__avatars')).toBeTruthy())
    // Each variant brings its own content.
    await user.selectOptions(region().getByLabelText('variant'), 'audio')
    await user.selectOptions(region().getByLabelText('type'), 'outbound')
    await waitFor(() => expect(frameDoc().querySelector('.cmp-message-bubbles__preview-meta-2')).toBeTruthy())
    expect(frameDoc().querySelector('.cmp-message-bubbles__avatars')).toBeNull()
    await user.click(region().getByLabelText('has avatar'))
    await user.selectOptions(region().getByLabelText('type'), 'incoming')
    await user.selectOptions(region().getByLabelText('variant'), 'single text')
    await waitFor(() => expect(frameDoc().querySelector('.cmp-message-bubbles__avatars')).toBeNull())
    await user.click(region().getByLabelText('has avatar'))
    await waitFor(() => expect(frameDoc().querySelector('.cmp-message-bubbles__avatars')).toBeTruthy())
  })

  it('offers every state the design has, including ones a script sets with a class, such as Selected', async () => {
    const { user } = await open({ name: 'Dropdown / menu item' })
    await waitFor(() => expect(root()).toBeTruthy())
    const group = region().getByRole('group', { name: 'State' })
    const labels = within(group).getAllByRole('button').map((b) => b.textContent)
    expect(labels[0]).toBe('Default')
    expect(labels).toEqual(expect.arrayContaining(['Hover', 'Disabled', 'Selected']))
    await user.click(within(group).getByRole('button', { name: 'Selected' }))
    await waitFor(() => expect(root().classList.contains('is-selected')).toBe(true))
    expect(root().getAttribute('aria-selected')).toBe('true')
    await user.click(within(group).getByRole('button', { name: 'Default' }))
    await waitFor(() => expect(root().classList.contains('is-selected')).toBe(false))
  })

  it('groups the sample values by kind: options, content, then show or hide', async () => {
    const cat = parseDesignMdText(Object.values(msgRaw)[0])
    const c = importDesignMd(cat, [cat.entries[0].id]).components[0]
    const p = await createProject({ name: 'Acme' })
    await mutateProject(p.id, (x) => ({ ...x, components: [c] }))
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    await screen.findByRole('list', { name: /Properties of/ })
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Component' }))
    const groups = within((await screen.findByText('Sample values')).closest('fieldset')!)
    const options = groups.getByRole('region', { name: 'Options' })
    const content = groups.getByRole('region', { name: 'Content' })
    const toggles = groups.getByRole('region', { name: 'Show or hide' })
    expect(within(options).getAllByRole('combobox').map((x) => x.id.length > 0)).toHaveLength(2)
    expect(within(content).getByLabelText(/supporting text/i).tagName).toBe('TEXTAREA')
    expect(within(toggles).getByLabelText('has avatar')).toBeTruthy()
    // Each kind sits in the one place: no selects among the toggles, no checkboxes among the options.
    expect(within(toggles).queryAllByRole('combobox')).toHaveLength(0)
    expect(within(options).queryAllByRole('checkbox')).toHaveLength(0)
    expect(options.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(content.compareDocumentPosition(toggles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says plainly that a component with no layer structure is not the design, and why', async () => {
    const c = { ...makeComponent({ name: 'Card', type: 'card', properties: [makeProperty({ key: 'title', label: 'Title', type: 'string' })] }), origin: { kind: 'figma-rest' as const, suggested: false } }
    const p = await createProject({ name: 'Acme' })
    await mutateProject(p.id, (x) => ({ ...x, components: [c] }))
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    await screen.findByRole('list', { name: /Properties of/ })
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Component' }))
    const note = await screen.findByRole('note')
    expect(note.textContent).toMatch(/This preview is not the design/)
    expect(note.textContent).toMatch(/came from the Figma API, which brings its fields and text but not its layers/)
    expect(note.textContent).toMatch(/DesignMD plugin/)
  })

  it('does not show that warning for a component that has its layers', async () => {
    await open()
    await waitFor(() => expect(root()).toBeTruthy())
    expect(screen.queryByRole('note')).toBeNull()
  })
})
