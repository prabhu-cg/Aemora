import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { readZip } from '../../../test/zipReader'
import { db } from '../../projects/db'
import { createProject, mutateProject } from '../../projects/repo'
import { makeComponent, makeProperty } from '../../components/factory'
import { parseImport } from '../../projects/repo'

afterEach(() => vi.restoreAllMocks())

/** Capture what would be downloaded, and under which file name. */
function captureDownloads() {
  const blobs: Blob[] = []
  const names: string[] = []
  URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x' }) as never
  URL.revokeObjectURL = vi.fn() as never
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download) })
  return { blobs, names }
}
const region = () => screen.findByRole('region', { name: 'Export' })

describe('Export section on the sample project', () => {
  const open = async () => {
    render(<MemoryRouter initialEntries={['/app/sample']}><AppRoutes /></MemoryRouter>)
    return region()
  }

  it('lists every dialog with where it belongs and its three checks', async () => {
    const r = await open()
    const rows = within(r).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    expect(rows[1].textContent).toContain('Card')
    expect(rows[1].textContent).toContain('/apps/sample-component-library/components/card/_cq_dialog/.content.xml')
    for (const row of rows) {
      expect(row.textContent).toMatch(/XML syntax: ok/)
      expect(row.textContent).toMatch(/Generator: ok/)
      expect(row.textContent).toMatch(/AEM structure: ok/)
    }
    expect(within(r).queryByText(/have problems|has problems/)).toBeNull()
  })

  it('downloads one dialog as a single XML file', async () => {
    const user = userEvent.setup()
    const { blobs, names } = captureDownloads()
    const r = await open()
    await user.click(within(r).getByRole('button', { name: 'Download XML for Card' }))
    expect(names).toEqual(['card.cq_dialog.content.xml'])
    expect(blobs[0].type).toMatch(/application\/xml/)
    const text = await blobs[0].text()
    expect(text).toContain('sling:resourceType="cq/gui/components/authoring/dialog"')
    expect(text).toContain('jcr:title="Card"')
    expect(await within(r).findByText('Downloaded card.cq_dialog.content.xml.')).toBeTruthy()
  })

  it('downloads everything as a ZIP laid out like an AEM project', async () => {
    const user = userEvent.setup()
    const { blobs, names } = captureDownloads()
    const r = await open()
    await user.click(within(r).getByRole('button', { name: /Download all as ZIP/ }))
    expect(names).toEqual(['sample-component-library-dialogs.zip'])
    expect(blobs[0].type).toBe('application/zip')
    const zip = readZip(new Uint8Array(await blobs[0].arrayBuffer()))
    expect(zip.map((e) => e.name)).toEqual([
      'README.txt',
      ...['button', 'card', 'image', 'text', 'container'].map((f) => `jcr_root/apps/sample-component-library/components/${f}/_cq_dialog/.content.xml`),
      'aemora-project.json',
    ])
    expect(zip.every((e) => e.crcOk)).toBe(true)
    expect(parseImport(zip.at(-1)!.text).projects[0].components).toHaveLength(5)
  })

  it('downloads the project configuration as JSON', async () => {
    const user = userEvent.setup()
    const { blobs, names } = captureDownloads()
    const r = await open()
    await user.click(within(r).getByRole('button', { name: /Download project JSON/ }))
    expect(names).toEqual(['sample-component-library.aemora.json'])
    const json = JSON.parse(await blobs[0].text())
    expect(json.format).toBe('aemora.project')
    expect(json.project.components).toHaveLength(5)
  })

  it('exporting the read-only sample writes nothing to storage', async () => {
    const user = userEvent.setup()
    captureDownloads()
    const r = await open()
    await user.click(within(r).getByRole('button', { name: /Download all as ZIP/ }))
    expect(await db.projects.count()).toBe(0)
  })
})

describe('Export section in your own projects', () => {
  it('warns about dialogs with problems, still lets you export them, and names them', async () => {
    const user = userEvent.setup()
    const { names } = captureDownloads()
    const p = await createProject({ name: 'Broken site' })
    const bad = makeComponent({ name: 'Menu', properties: [makeProperty({ key: 'kind', label: 'Kind', type: 'enum' })] }) // select with no choices
    const good = makeComponent({ name: 'Title', properties: [makeProperty({ key: 'text', label: 'Text' })] })
    await mutateProject(p.id, (x) => ({ ...x, components: [bad, good] }))
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    const r = await region()
    expect(within(r).getAllByRole('status')[0].textContent).toMatch(/1 of 2 dialogs has problems \(Menu\)/)
    const rows = within(r).getAllByRole('listitem')
    expect(rows[0].textContent).toMatch(/Generator: 1 to fix/)
    expect(rows[1].textContent).toMatch(/Generator: ok/)
    await user.click(within(r).getByRole('button', { name: /Download all as ZIP/ }))
    expect(names).toEqual(['broken-site-dialogs.zip'])
  })

  it('shows hand-edited XML as such and exports the edit', async () => {
    const user = userEvent.setup()
    const { blobs } = captureDownloads()
    const p = await createProject({ name: 'Site' })
    const c = makeComponent({ name: 'Card', properties: [makeProperty({ key: 'a', label: 'A' })] })
    await mutateProject(p.id, (x) => ({ ...x, components: [c], generatedXml: { [c.id]: { xml: '<?xml version="1.0"?><jcr:root>mine</jcr:root>', base: 'b', generatedAt: 't', edited: true, format: 'standalone' } } }))
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    const r = await region()
    expect(within(r).getByText('hand-edited XML')).toBeTruthy()
    await user.click(within(r).getByRole('button', { name: 'Download XML for Card' }))
    expect(await blobs[0].text()).toBe('<?xml version="1.0"?><jcr:root>mine</jcr:root>')
  })

  it('with no components, says so and still offers the project JSON', async () => {
    const p = await createProject({ name: 'Empty' })
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    const r = await region()
    expect(r.textContent).toMatch(/Nothing to export yet/)
    expect(within(r).getByRole('button', { name: /Download project JSON/ })).toBeTruthy()
    expect(within(r).queryByRole('button', { name: /ZIP/ })).toBeNull()
  })
})
