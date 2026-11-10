import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { makeComponent, makeProperty } from '../../components/factory'
import { importDesignMd, parseDesignMdText } from '../../inputs/designmd/parse'
import { highlight } from '../../xml/format'

const raw = import.meta.glob('../../../test/fixtures/designmd-rayna.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const catalog = parseDesignMdText(Object.values(raw)[0])

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

async function open(opts: { plain?: boolean } = {}) {
  const c = opts.plain
    ? makeComponent({ name: 'Card', type: 'card', properties: [makeProperty({ key: 'title', label: 'Title', type: 'string' })] })
    : importDesignMd(catalog, [catalog.entries.find((e) => e.name === 'Button / primary')!.id]).components[0]
  const p = await createProject({ name: 'Acme Site' })
  await mutateProject(p.id, (x) => ({ ...x, components: [c] }))
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('list', { name: /Properties of/ })
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Markup' }))
  await screen.findByRole('region', { name: 'Component markup' })
  return p
}
const region = () => within(screen.getByRole('region', { name: 'Component markup' }))
const editor = () => screen.getByRole('textbox', { name: /View|Edit/ }) as HTMLTextAreaElement
const pick = (name: string) => userEvent.setup().click(region().getByRole('button', { name }))
const storedFiles = async (id: string) => (await db.projects.get(id))!.markup

describe('Markup tab', () => {
  it('sits between Dialog and Preview in the tab order', async () => {
    await open()
    expect(within(screen.getByRole('tablist', { name: 'Component view' })).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+ to fix/, '').trim())).toEqual(['Properties', 'AEM fields', 'Dialog', 'Markup', 'Preview', 'XML'])
  })

  it('shows the generated HTL read-only, with where the file goes, and stores nothing for untouched output', async () => {
    const p = await open()
    expect(editor().readOnly).toBe(true)
    expect(editor().value).toContain('<sly data-sly-use.model="com.example.core.models.ButtonPrimaryModel"></sly>')
    expect(editor().value).toContain('class="cmp-button-primary ')
    expect(region().getByText('/apps/acme-site/components/button-primary/button-primary.html')).toBeTruthy()
    expect(await storedFiles(p.id)).toEqual({})
  })

  it('switches between the files and shows each one’s target path', async () => {
    await open()
    await pick('CSS')
    expect(editor().value).toContain('.cmp-button-primary {')
    expect(region().getByText('/apps/acme-site/components/button-primary/clientlibs/css/button-primary.css')).toBeTruthy()
    await pick('Sling Model')
    expect(editor().value).toContain('public class ButtonPrimaryModel')
    expect(region().getByText('core/src/main/java/com/example/core/models/ButtonPrimaryModel.java')).toBeTruthy()
    await pick('.content.xml')
    expect(editor().value).toContain('jcr:primaryType="cq:Component"')
    await pick('Edit config')
    expect(editor().value).toContain('cq:EditConfig')
  })

  it('stores a hand edit for that file only, flags it as edited, and resets it', async () => {
    const user = userEvent.setup()
    const p = await open()
    await pick('CSS')
    await user.click(region().getByRole('radio', { name: 'Edit' }))
    fireEvent.change(editor(), { target: { value: '.mine { color: red; }\n' } })
    await waitFor(async () => expect(Object.keys((await storedFiles(p.id))[Object.keys(await storedFiles(p.id))[0]].files)).toEqual(['css']))
    expect(region().getByRole('button', { name: /CSS edited/ })).toBeTruthy()
    expect(region().queryByRole('button', { name: /HTL edited/ })).toBeNull()
    await user.click(region().getByRole('button', { name: 'Reset to generated version' }))
    await user.click(region().getByRole('button', { name: 'Discard' }))
    await waitFor(async () => expect(await storedFiles(p.id)).toEqual({}))
    await waitFor(() => expect(editor().value).toContain('.cmp-button-primary {'))
  })

  it('warns when a hand-edited file no longer matches the design', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(region().getByRole('radio', { name: 'Edit' }))
    fireEvent.change(editor(), { target: { value: editor().value + '<!-- mine -->\n' } })
    await waitFor(async () => expect(Object.keys(await storedFiles(p.id))).toHaveLength(1))
    await user.click(region().getByRole('button', { name: /Naming settings/ }))
    fireEvent.change(region().getByLabelText('CSS prefix'), { target: { value: 'acme' } })
    expect((await screen.findByText(/has hand edits, and the design or settings have changed/)).closest('[role="status"]')).toBeTruthy()
  })

  it('applies naming settings to every file, saves only valid values and says why others are not saved', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(region().getByRole('button', { name: /Naming settings/ }))
    fireEvent.change(region().getByLabelText('CSS prefix'), { target: { value: 'acme' } })
    fireEvent.change(region().getByLabelText('Java package'), { target: { value: 'com.acme.models' } })
    fireEvent.change(region().getByLabelText('Component group'), { target: { value: 'Acme - Content' } })
    await waitFor(async () => expect((await db.projects.get(p.id))!.markupSettings).toEqual({ cssPrefix: 'acme', javaPackage: 'com.acme.models', group: 'Acme - Content' }))
    await waitFor(() => expect(editor().value).toContain('class="acme-button-primary '))
    await pick('Sling Model')
    await waitFor(() => expect(editor().value).toMatch(/^package com\.acme\.models;/))
    await pick('.content.xml')
    await waitFor(() => expect(editor().value).toContain('componentGroup="Acme - Content"'))

    fireEvent.change(region().getByLabelText('Java package'), { target: { value: 'Com.Bad Package' } })
    expect(region().getByLabelText('Java package').getAttribute('aria-invalid')).toBe('true')
    expect(region().getByText(/Not saved\. Lowercase, dot separated/)).toBeTruthy()
    expect((await db.projects.get(p.id))!.markupSettings.javaPackage).toBe('com.acme.models')
  })

  it('lists what was inferred or left out, warnings first, and runs the consistency checks', async () => {
    await open()
    const notes = within(screen.getByRole('region', { name: 'What was inferred or left out' }))
    const items = notes.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(items.length).toBeGreaterThan(0)
    expect(items.some((t) => /accessible name/.test(t))).toBe(true)
    expect(within(screen.getByRole('region', { name: 'Consistency checks' })).getByText('No problems found.')).toBeTruthy()
  })

  it('shows a problem when a hand edit breaks the consistency checks', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(region().getByRole('radio', { name: 'Edit' }))
    fireEvent.change(editor(), { target: { value: editor().value + '<p>${model.doesNotExist}</p>\n' } })
    expect(await within(screen.getByRole('region', { name: 'Consistency checks' })).findByText(/model\.doesNotExist/)).toBeTruthy()
  })

  it('explains when a component has no layer structure', async () => {
    await open({ plain: true })
    const notes = within(screen.getByRole('region', { name: 'What was inferred or left out' }))
    expect(notes.getByText(/no layer structure/)).toBeTruthy()
    expect(editor().value).toContain('data-sly-test="${model.title}"')
  })

  it('removes a deleted component’s edits with it', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(region().getByRole('radio', { name: 'Edit' }))
    fireEvent.change(editor(), { target: { value: editor().value + '\n' } })
    await waitFor(async () => expect(Object.keys(await storedFiles(p.id))).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Delete component Button / primary' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await storedFiles(p.id)).toEqual({}))
  })
})

describe('tabs', () => {
  it('move with the arrow keys, Home and End', async () => {
    await open()
    const user = userEvent.setup()
    screen.getByRole('tab', { name: 'Markup' }).focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true'))
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Preview' }))
    await user.keyboard('{End}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'XML' }).getAttribute('aria-selected')).toBe('true'))
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Properties' }).getAttribute('aria-selected')).toBe('true'))
    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'XML' }).getAttribute('aria-selected')).toBe('true'))
    await user.keyboard('{Home}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Properties' }).getAttribute('aria-selected')).toBe('true'))
    expect(within(screen.getByRole('tablist', { name: 'Component view' })).getAllByRole('tab').filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1)
  })
})

describe('editor highlighting', () => {
  it('escapes everything, whatever the language', () => {
    for (const lang of ['xml', 'plain'] as const) {
      const out = highlight('<img src=x onerror="alert(1)"><script>x</script> & ${a}', lang)
      expect(out).not.toMatch(/<(script|img)/)
      expect(out).toContain('&lt;')
      expect(out).toContain('&amp;')
    }
  })
})
