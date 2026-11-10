import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject } from '../../projects/repo'

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })
async function open() {
  const p = await createProject({ name: 'Teaser' })
  render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Bring in a design' }))
  await screen.findByRole('dialog', { name: 'Bring in a design' })
  return p
}
const paste = (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const box = screen.getByLabelText(/Component JSON|Copied component description|Plugin payload/)
  return user.click(box).then(() => user.paste(text))
}

describe('input panel', () => {
  it('imports JSON through review into the project, and shows it in the component list', async () => {
    const user = userEvent.setup()
    const p = await open()
    await paste(user, '{"schema":"aemora.components/v1","components":[{"name":"Button","properties":[{"name":"Label","required":true},{"name":"Size","type":"enum","values":["s","m"]}]}]}')
    await user.click(screen.getByRole('button', { name: 'Validate and review' }))
    const review = await screen.findByRole('region', { name: 'Import review' })
    expect(within(review).getByText('Button')).toBeTruthy()
    expect(await db.projects.get(p.id).then((x) => x!.components.length)).toBe(0) // nothing added yet
    await user.click(within(review).getByRole('button', { name: /Add 1 component to project/ }))
    await waitFor(async () => expect((await db.projects.get(p.id))!.components).toHaveLength(1))
    const list = await screen.findByRole('list', { name: 'Components in this project' })
    expect(within(list).getByText('Button')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Import review' })).toBeNull()
  })

  it('shows every validation problem with its path and imports nothing', async () => {
    const user = userEvent.setup()
    const p = await open()
    await paste(user, '{"schema":"aemora.components/v1","components":[{"properties":[{}]}]}')
    await user.click(screen.getByRole('button', { name: 'Validate and review' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/components\[0\]\.name/)
    expect(alert.textContent).toMatch(/components\[0\]\.properties\[0\]\.name/)
    expect((await db.projects.get(p.id))!.components).toHaveLength(0)
  })

  it('loads a sample, and lets a clipboard line the parser could not read be added by hand', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('button', { name: 'Card' }))
    expect(await screen.findByRole('region', { name: 'Import review' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    await user.click(screen.getByRole('tab', { name: 'Clipboard' }))
    await paste(user, 'Component: Button\n- Label: text\nExtra stray line')
    await user.click(screen.getByRole('button', { name: 'Parse and review' }))
    const review = await screen.findByRole('region', { name: 'Import review' })
    expect(within(review).getByText(/Extra stray line/)).toBeTruthy()
    await user.click(within(review).getByRole('button', { name: 'Add as property' }))
    expect(within(review).queryByText(/Lines that need your attention/)).toBeNull()
    expect(within(review).getByText(/Extra stray line/)).toBeTruthy() // now listed as a property label
  })

  it('walks the manual screenshot workflow end to end', async () => {
    const user = userEvent.setup()
    const p = await open()
    await user.click(screen.getByRole('tab', { name: 'Screenshot' }))
    await user.upload(screen.getByLabelText('Choose a screenshot'), new File([PNG as BlobPart], 'card.png', { type: 'image/png' }))
    expect(await screen.findByAltText('Uploaded screenshot to annotate')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Add region/ }))
    await user.type(screen.getByLabelText('Component name'), 'Hero Card')
    await user.click(screen.getByRole('button', { name: /Add property/ }))
    await user.type(screen.getByLabelText('Property 1 name'), 'Heading')
    await user.selectOptions(screen.getByLabelText('Property 1 region'), 'Region 1')
    await user.click(screen.getByRole('button', { name: 'Review component' }))
    const review = await screen.findByRole('region', { name: 'Import review' })
    expect(within(review).getByText('Hero Card')).toBeTruthy()
    await user.click(within(review).getByRole('button', { name: /Add 1 component/ }))
    await waitFor(async () => {
      const saved = (await db.projects.get(p.id))!
      expect(saved.components[0].properties[0].origin.region).toBeTruthy()
      expect(saved.assets).toHaveLength(1)
      expect(saved.inputSource.kind).toBe('screenshot')
    })
  })

  it('rejects a non-image file with a clear message', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('tab', { name: 'Screenshot' }))
    await user.upload(screen.getByLabelText('Choose a screenshot'), new File(['<svg/>'], 'x.png', { type: 'image/png' }))
    expect((await screen.findByText(/Only PNG, JPG and WebP/))).toBeTruthy()
  })

  it('keeps the Figma token field masked and reports a bad link without calling out', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('tab', { name: 'Figma API' }))
    expect((screen.getByLabelText('Personal access token') as HTMLInputElement).type).toBe('password')
    // Nothing to read yet, so the button is off and says why.
    const read = screen.getByRole('button', { name: 'Read components' }) as HTMLButtonElement
    expect(read.disabled).toBe(true)
    expect(screen.getByText(/Enter the Figma file link and your access token/)).toBeTruthy()
    await user.type(screen.getByLabelText('Figma file URL or file key'), 'not a figma link')
    expect(read.disabled).toBe(true) // the token is still missing
    await user.type(screen.getByLabelText('Personal access token'), 'figd_test')
    expect(read.disabled).toBe(false)
    await user.click(read)
    expect(await screen.findByText(/Figma/, { selector: '[role="alert"], p.text-danger, p[role="alert"]' })).toBeTruthy()
  })

  it('keeps Review component off until the screenshot, a name and a property are all there, and says what is missing', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('tab', { name: 'Screenshot' }))
    const review = screen.getByRole('button', { name: 'Review component' }) as HTMLButtonElement
    expect(review.disabled).toBe(true)
    expect(screen.getByText(/Still needed: a screenshot, a component name, at least one named property/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Add region' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Choose a screenshot first/)).toBeTruthy()
    await user.type(screen.getByLabelText('Component name'), 'Card')
    expect(screen.getByText(/Still needed: a screenshot, at least one named property/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add property' }))
    await user.type(screen.getByLabelText('Property 1 name'), 'Title')
    await user.upload(screen.getByLabelText('Choose a screenshot', { selector: 'input' }), new File([PNG], 'c.png', { type: 'image/png' }))
    await screen.findByAltText('Uploaded screenshot to annotate')
    expect(review.disabled).toBe(false)
    expect(screen.getByText(/A region is a box you draw on the screenshot/)).toBeTruthy()
  })
})

describe('screenshots from the clipboard', () => {
  const png = () => new File([PNG], 'image.png', { type: 'image/png' })
  const pasteImage = (target: Element | Document, extra: Record<string, string> = {}) =>
    fireEvent.paste(target, { clipboardData: { files: [png()], items: [{ kind: 'file', type: 'image/png', getAsFile: () => png() }], getData: (t: string) => extra[t] ?? '' } })

  it('a screenshot pasted on the Screenshot tab loads into the annotator', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('tab', { name: 'Screenshot' }))
    pasteImage(document)
    expect(await screen.findByAltText('Uploaded screenshot to annotate')).toBeTruthy()
  })

  it('a screenshot pasted while another tab is showing takes you to the Screenshot tab', async () => {
    await open()
    expect(screen.getByLabelText('Component JSON')).toBeTruthy()
    pasteImage(screen.getByLabelText('Component JSON'))
    expect(await screen.findByAltText('Uploaded screenshot to annotate')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Screenshot' }).getAttribute('aria-selected')).toBe('true')
  })

  it('leaves ordinary text pastes alone, so pasting JSON into the box still works', async () => {
    await open()
    const box = screen.getByLabelText('Component JSON')
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
    ev.clipboardData = { files: [], items: [], getData: () => '{"a":1}' }
    box.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByAltText('Uploaded screenshot to annotate')).toBeNull()
  })

  it('the Paste button reads an image from the clipboard, and explains when there is none or access is refused', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('tab', { name: 'Screenshot' }))
    const clip = { read: vi.fn() }
    Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true })
    clip.read.mockResolvedValueOnce([{ types: ['text/plain'], getType: async () => new Blob(['x']) }])
    await user.click(screen.getByRole('button', { name: 'Paste from clipboard' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/no image on the clipboard/)
    clip.read.mockRejectedValueOnce(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Paste from clipboard' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/did not allow reading the clipboard/)
    clip.read.mockResolvedValueOnce([{ types: ['image/png'], getType: async () => new Blob([PNG], { type: 'image/png' }) }])
    await user.click(screen.getByRole('button', { name: 'Paste from clipboard' }))
    expect(await screen.findByAltText('Uploaded screenshot to annotate')).toBeTruthy()
  })

  it('a dropped image loads, and a dropped non-image is refused with a reason', async () => {
    const user = userEvent.setup()
    await open()
    await user.click(screen.getByRole('tab', { name: 'Screenshot' }))
    const zone = screen.getByRole('button', { name: /Choose a screenshot/ })
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['hi'], 'a.txt', { type: 'text/plain' })], items: [] } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/not an image/)
    fireEvent.drop(zone, { dataTransfer: { files: [png()], items: [] } })
    expect(await screen.findByAltText('Uploaded screenshot to annotate')).toBeTruthy()
  })
})

describe('input methods', () => {
  it('hides the old Figma plugin tab for now and shows the DesignMD tab with the others', async () => {
    await open()
    const names = within(screen.getByRole('tablist', { name: 'Input method' })).getAllByRole('tab').map((t) => t.textContent)
    expect(names).toEqual(['JSON', 'Clipboard', 'DesignMD', 'Figma API', 'Screenshot'])
  })
})
