import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { figmaSession } from '../figma/client'
import { applyImport, MAX_ASSETS } from '../apply'
import { DesignPreview } from '../../components/DesignPreview'
import { makeComponent, makeProperty } from '../../components/factory'
import { db } from '../../projects/db'
import { createProject, exportBackupJson, exportProjectJson, getProject } from '../../projects/repo'
import type { ImportResult } from '../types'

const files = import.meta.glob('../../../test/fixtures/figma-file.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const figmaFile = Object.values(files)[0]
const KEY = 'AbC123xyz789QwErTy'
const TOKEN = 'figd_do_not_leak_me'
const S3 = 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/images'
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

afterEach(() => { vi.unstubAllGlobals(); figmaSession.clear() })

function stubFigma(opts: { imageDownloadFails?: boolean } = {}) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    if (url.startsWith('https://api.figma.com/v1/files/')) return new Response(figmaFile, { status: 200 })
    if (url.startsWith('https://api.figma.com/v1/images/')) {
      const ids = decodeURIComponent(new URL(url).searchParams.get('ids') ?? '').split(',')
      return new Response(JSON.stringify({ err: null, images: Object.fromEntries(ids.map((i) => [i, `${S3}/${i.replace(/:/g, '-')}`])) }), { status: 200 })
    }
    if (opts.imageDownloadFails) throw new TypeError('Failed to fetch')
    return new Response(PNG as BlobPart, { status: 200 })
  }))
  return urls
}

async function readFigma(user: ReturnType<typeof userEvent.setup>, { previews = true }: { previews?: boolean } = {}) {
  const p = await createProject({ name: 'Design system' })
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Bring in a design' })
  await user.click(screen.getByRole('tab', { name: 'Figma API' }))
  await user.type(screen.getByLabelText('Figma file URL or file key'), `https://www.figma.com/design/${KEY}/Design-System`)
  await user.type(screen.getByLabelText('Personal access token'), TOKEN)
  if (!previews) await user.click(screen.getByLabelText(/Also render a preview picture/))
  await user.click(screen.getByRole('button', { name: 'Read components' }))
  return { p, review: await screen.findByRole('region', { name: 'Import review' }) }
}

describe('Figma component previews in the tool', () => {
  it('renders previews on import, shows them in the review, and keeps them with the component', async () => {
    const user = userEvent.setup()
    stubFigma()
    const { p, review } = await readFigma(user)
    expect(within(review).getByRole('img', { name: 'Preview of Button' })).toBeTruthy()
    expect(within(review).getByRole('img', { name: 'Preview of Card' })).toBeTruthy()
    expect(review.textContent).toMatch(/do not update by themselves/)
    await user.click(within(review).getByRole('button', { name: /Add 2 components/ }))
    await waitFor(async () => expect((await getProject(p.id))!.assets).toHaveLength(2))
    const saved = (await getProject(p.id))!
    expect(saved.components.map((c) => !!c.previewAssetId)).toEqual([true, true])
    expect(saved.assets.every((a) => a.dataUrl.startsWith('data:image/png;base64,'))).toBe(true)
  })

  it('shows the preview with the component, with a link back to the node in Figma', async () => {
    const user = userEvent.setup()
    stubFigma()
    const { review } = await readFigma(user)
    await user.click(within(review).getByRole('button', { name: /Add 2 components/ }))
    const details = (await screen.findByText('Design preview')).closest('details')!
    expect(details.open).toBe(true)
    expect(within(details).getByRole('img', { name: 'Figma render of Button' })).toBeTruthy()
    expect(details.textContent).toMatch(/A picture Figma rendered when this component was imported/)
    const link = within(details).getByRole('link', { name: /Open in Figma/ })
    expect(link.getAttribute('href')).toBe(`https://www.figma.com/design/${KEY}?node-id=1-10`)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('removing a preview removes its picture from the project, and only that one', async () => {
    const user = userEvent.setup()
    stubFigma()
    const { p, review } = await readFigma(user)
    await user.click(within(review).getByRole('button', { name: /Add 2 components/ }))
    await user.click(await screen.findByRole('button', { name: 'Remove preview' }))
    await waitFor(async () => expect((await getProject(p.id))!.assets).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Figma render of Button' })).toBeNull())
    expect((await getProject(p.id))!.components.map((c) => !!c.previewAssetId)).toEqual([false, true])
  })

  it('asks for no previews when the box is unticked, and makes no image request', async () => {
    const user = userEvent.setup()
    const urls = stubFigma()
    const { review } = await readFigma(user, { previews: false })
    expect(within(review).queryByRole('img')).toBeNull()
    expect(urls.some((u) => u.includes('/v1/images/'))).toBe(false)
  })

  it('still imports every component when the pictures cannot be downloaded, and says why', async () => {
    const user = userEvent.setup()
    stubFigma({ imageDownloadFails: true })
    const { p, review } = await readFigma(user)
    expect(review.textContent).toMatch(/Could not download the preview for Button/)
    expect(within(review).queryByRole('img')).toBeNull()
    await user.click(within(review).getByRole('button', { name: /Add 2 components/ }))
    await waitFor(async () => expect((await getProject(p.id))!.components).toHaveLength(2))
    expect((await getProject(p.id))!.assets).toEqual([])
    expect(screen.queryByText('Design preview')).toBeNull()
  })

  it('keeps the token out of the project, its export and the backup', async () => {
    const user = userEvent.setup()
    stubFigma()
    const { p, review } = await readFigma(user)
    await user.click(within(review).getByRole('button', { name: /Add 2 components/ }))
    await waitFor(async () => expect((await getProject(p.id))!.assets).toHaveLength(2))
    const all = [exportProjectJson((await getProject(p.id))!), await exportBackupJson(), JSON.stringify(await db.projects.toArray())].join('\n')
    expect(all).toContain('data:image/png;base64,') // the pictures travel with the project
    expect(all).not.toContain(TOKEN)
  })
})

describe('design preview component', () => {
  it('shows a screenshot with the regions that were marked, numbered, and no Figma link', () => {
    const shot = { id: 'a1', name: 's.png', mime: 'image/png' as const, bytes: 70, dataUrl: 'data:image/png;base64,AAAA' }
    const c = {
      ...makeComponent({ name: 'Hero', origin: { kind: 'screenshot', assetId: 'a1', suggested: false }, previewAssetId: 'a1' }),
      properties: [
        makeProperty({ key: 'h', label: 'Heading', origin: { kind: 'screenshot', assetId: 'a1', region: { x: 10, y: 20, w: 30, h: 15 }, suggested: false } }),
        makeProperty({ key: 'n', label: 'No region' }),
      ],
    }
    render(<DesignPreview component={c} assets={[shot]} />)
    expect(screen.getByRole('img', { name: 'Screenshot used for Hero' })).toBeTruthy()
    expect(screen.getByText(/The screenshot you annotated/)).toBeTruthy()
    expect(screen.getByRole('list').textContent).toContain('Heading')
    expect(screen.queryByText('No region')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove preview' })).toBeNull() // no handler given
  })
  it('renders nothing when the component has no picture, or the picture is gone', () => {
    const { container, rerender } = render(<DesignPreview component={makeComponent({ name: 'X' })} assets={[]} />)
    expect(container.firstChild).toBeNull()
    rerender(<DesignPreview component={{ ...makeComponent({ name: 'X' }), previewAssetId: 'missing' }} assets={[]} />)
    expect(container.firstChild).toBeNull()
  })
  it('read-only projects show the picture but offer no removal', () => {
    const a = { id: 'a', name: 'p.png', mime: 'image/png' as const, bytes: 1, dataUrl: 'data:image/png;base64,AAAA' }
    render(<DesignPreview component={{ ...makeComponent({ name: 'X', origin: { kind: 'figma-rest', ref: `${KEY}:1:2`, suggested: false } }), previewAssetId: 'a' }} assets={[a]} readOnly onRemove={() => undefined} />)
    expect(screen.getByRole('img')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove preview' })).toBeNull()
  })
})

describe('picture limits when adding to a project', () => {
  const mkAsset = (i: number) => ({ id: `a${i}`, name: `${i}.png`, mime: 'image/png' as const, bytes: 1, dataUrl: 'data:image/png;base64,AAAA' })
  it('keeps what fits, drops the rest, and clears the link on components whose picture was left out', async () => {
    const p = await createProject({ name: 'Full' })
    const full = { ...p, assets: Array.from({ length: MAX_ASSETS - 1 }, (_, i) => mkAsset(i)) }
    const incoming: ImportResult = {
      components: [{ ...makeComponent({ name: 'One' }), previewAssetId: 'n1' }, { ...makeComponent({ name: 'Two' }), previewAssetId: 'n2' }],
      warnings: [], uncertain: [], source: { kind: 'figma-rest' }, assets: [mkAsset(100), mkAsset(101)].map((a, i) => ({ ...a, id: `n${i + 1}` })),
    }
    const { project, notes } = applyImport(full, incoming)
    expect(project.assets).toHaveLength(MAX_ASSETS)
    expect(project.components.map((c) => c.previewAssetId)).toEqual(['n1', undefined])
    expect(notes[0].message).toMatch(/40 pictures\. 1 picture was left out; the components were still added/)
  })
})
