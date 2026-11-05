import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  await screen.findByRole('heading', { name: 'Bring in a design' })
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
    await user.click(screen.getByRole('button', { name: 'Read components' }))
    expect(await screen.findByText(/Enter a Figma file URL/)).toBeTruthy()
  })
})
