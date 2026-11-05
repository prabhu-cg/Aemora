import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { makeComponent, makeProperty } from '../../components/factory'

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })
afterEach(() => vi.restoreAllMocks())

async function open(opts: { enumNoValues?: boolean } = {}) {
  const props = [
    makeProperty({ key: 'title', label: 'Title', type: 'string', required: true, description: 'Shown above' }),
    makeProperty({ key: 'size', label: 'Size', type: 'enum', allowedValues: opts.enumNoValues ? [] : ['s', 'l'], defaultValue: opts.enumNoValues ? null : 's' }),
  ]
  const c = makeComponent({ name: 'Card', type: 'card', properties: props })
  const p = await createProject({ name: 'My Site', aemComponentName: 'card' })
  await mutateProject(p.id, (x) => ({ ...x, components: [c] }))
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('list', { name: /Properties of/ })
  await userEvent.setup().click(screen.getByRole('tab', { name: 'XML' }))
  await screen.findByRole('region', { name: 'Dialog XML' })
  return p
}
const editor = () => screen.getByRole('textbox', { name: /dialog XML/i }) as HTMLTextAreaElement
const stored = async (id: string) => Object.values((await db.projects.get(id))!.generatedXml)[0]

describe('XML tab', () => {
  it('shows complete generated XML, read-only by default, with the target path', async () => {
    await open()
    const xml = editor().value
    expect(editor().readOnly).toBe(true)
    expect(editor().getAttribute('aria-label')).toBe('Dialog XML (read-only)')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    for (const part of ['jcr:root', 'cq/gui/components/authoring/dialog', 'sling:resourceType="granite/ui/components/coral/foundation/tabs"', 'layouts/fixedcolumns', 'fieldLabel="Title"', 'name="./size"']) expect(xml).toContain(part)
    expect(screen.getByText('/apps/my-site/components/card/_cq_dialog/.content.xml')).toBeTruthy()
    expect((await db.projects.toArray())[0].generatedXml).toEqual({}) // nothing stored for untouched output
  })

  it('reports the three validation layers separately, and says the AEM layer is not a real AEM test', async () => {
    await open()
    expect(screen.getByRole('region', { name: 'XML syntax validation' }).textContent).toMatch(/Well-formed/)
    expect(screen.getByRole('region', { name: 'Generator validation' }).textContent).toMatch(/No problems/)
    const aem = screen.getByRole('region', { name: 'AEM compatibility validation' })
    expect(aem.textContent).toMatch(/No structural problems found/)
    expect(aem.textContent).toMatch(/This is not a test in AEM/)
    const summary = screen.getByRole('group', { name: 'Validation summary' })
    expect(summary.textContent).toMatch(/XML syntax: well-formed/)
    expect(summary.textContent).toMatch(/Generator: no problems/)
    expect(summary.textContent).toMatch(/AEM structure: no problems/)
  })

  it('shows generator problems from the model without touching syntax', async () => {
    await open({ enumNoValues: true })
    const gen = screen.getByRole('region', { name: 'Generator validation' })
    expect(gen.textContent).toMatch(/A select needs at least one choice/)
    expect(screen.getByRole('group', { name: 'Validation summary' }).textContent).toMatch(/XML syntax: well-formed/)
  })

  it('switches to inline cq:dialog output', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByLabelText('Inline cq:dialog'))
    expect(editor().value).toContain('<cq:dialog')
    expect(editor().value).toContain('jcr:primaryType="cq:Component"')
    expect(screen.getByText('/apps/my-site/components/card/.content.xml')).toBeTruthy()
  })

  it('edit mode lets you change the XML, stores it, and re-validates as you type', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByLabelText('Edit XML'))
    expect(editor().readOnly).toBe(false)
    const original = editor().value
    fireEvent.change(editor(), { target: { value: original.replace('fieldLabel="Title"', 'fieldLabel="Headline"') } })
    await waitFor(async () => expect((await stored(p.id)).edited).toBe(true))
    expect((await stored(p.id)).xml).toContain('fieldLabel="Headline"')
    expect((await stored(p.id)).base).toBe(original)

    fireEvent.change(editor(), { target: { value: editor().value + '<broken' } })
    await waitFor(() => expect(screen.getByRole('group', { name: 'Validation summary' }).textContent).toMatch(/not well-formed/))
    expect(screen.getByRole('region', { name: 'AEM compatibility validation' }).textContent).toMatch(/Not checked: fix the XML syntax first/)
    fireEvent.change(editor(), { target: { value: editor().value.replace('<broken', '') } })
    await waitFor(() => expect(screen.getByRole('group', { name: 'Validation summary' }).textContent).toMatch(/XML syntax: well-formed/))
  })

  it('refuses DOCTYPE/ENTITY in hand-written XML', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByLabelText('Edit XML'))
    fireEvent.change(editor(), { target: { value: '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>' } })
    await waitFor(() => expect(screen.getByRole('region', { name: 'XML syntax validation' }).textContent).toMatch(/DOCTYPE and ENTITY declarations are not allowed/))
  })

  it('formats sloppy XML and explains why it cannot format broken XML', async () => {
    const user = userEvent.setup()
    await open()
    expect((screen.getByRole('button', { name: /Format/ }) as HTMLButtonElement).disabled).toBe(true) // read-only
    await user.click(screen.getByLabelText('Edit XML'))
    const original = editor().value
    fireEvent.change(editor(), { target: { value: original.replace(/\n\s+/g, ' ') } })
    await user.click(screen.getByRole('button', { name: /Format/ }))
    await waitFor(() => expect(editor().value.split('\n').length).toBeGreaterThan(20))
    expect(editor().value).toContain('\n    <content')
    fireEvent.change(editor(), { target: { value: '<a><b></a>' } })
    await user.click(screen.getByRole('button', { name: /Format/ }))
    const status = within(screen.getByRole('toolbar', { name: 'XML actions' })).getByRole('status')
    await waitFor(() => expect(status.textContent).not.toBe(''))
    expect(status.textContent).not.toBe('Formatted.')
    expect(editor().value).toBe('<a><b></a>') // left exactly as typed
  })

  it('Reset to generated version asks first, then restores the generated XML and clears the stored edit', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByLabelText('Edit XML'))
    const original = editor().value
    fireEvent.change(editor(), { target: { value: original.replace('Title', 'Edited') } })
    await waitFor(async () => expect((await stored(p.id)).edited).toBe(true))
    expect(screen.getByText(/output format is locked/i)).toBeTruthy()
    await user.click(await screen.findByRole('button', { name: 'Reset to generated version' }))
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(editor().value).toContain('Edited')
    await user.click(screen.getByRole('button', { name: 'Reset to generated version' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(async () => expect((await db.projects.get(p.id))!.generatedXml).toEqual({}))
    await waitFor(() => expect(editor().value).toBe(original))
  })

  it('warns when hand-edited XML is out of date after the design changed', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByLabelText('Edit XML'))
    fireEvent.change(editor(), { target: { value: editor().value.replace('Title', 'Edited') } })
    await waitFor(() => expect(screen.getByText(/output format is locked/i)).toBeTruthy())
    await user.click(screen.getByRole('tab', { name: /^Dialog/ }))
    const t = await screen.findByLabelText('Tab 1 title')
    await user.clear(t); await user.type(t, 'Basics')
    await user.click(screen.getByRole('tab', { name: 'XML' }))
    expect(await screen.findByText(/hand edits, and the dialog design has changed since/)).toBeTruthy()
  })

  it('Regenerate on untouched output just refreshes and says so', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(await screen.findByText('Regenerated from the current dialog.')).toBeTruthy()
  })

  it('copies the XML to the clipboard', async () => {
    const user = userEvent.setup()
    await open()
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    await user.click(screen.getByRole('button', { name: /Copy/ }))
    expect(write).toHaveBeenCalledWith(editor().value)
    expect(await screen.findByText('Copied the XML.')).toBeTruthy()
  })

  it('downloads a correctly named XML file', async () => {
    const user = userEvent.setup()
    await open()
    let blob: Blob | undefined
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:x' }) as never
    URL.revokeObjectURL = vi.fn() as never
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('card.cq_dialog.content.xml') })
    await user.click(screen.getByRole('button', { name: /Download/ }))
    expect(click).toHaveBeenCalled()
    expect(blob?.type).toMatch(/application\/xml/)
    expect(await blob!.text()).toBe(editor().value)
  })

  it('highlighting does not break the real text field', async () => {
    await open()
    expect(within(screen.getByRole('region', { name: 'Dialog XML' })).getByRole('textbox', { name: /dialog XML/i }).tagName).toBe('TEXTAREA')
  })
})
