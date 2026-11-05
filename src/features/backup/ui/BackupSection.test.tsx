import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject, exportBackupJson, listProjects, mutateProject } from '../../projects/repo'
import { createSnapshot, listSnapshots } from '../service'

afterEach(() => vi.restoreAllMocks())
const openSettings = async () => {
  render(<MemoryRouter initialEntries={['/app/settings']}><AppRoutes /></MemoryRouter>)
  return screen.findByRole('region', { name: 'Backup and restore' })
}

describe('Backup and restore on the Settings page', () => {
  it('explains where the data lives and starts with no restore points', async () => {
    const r = await openSettings()
    expect(r.textContent).toMatch(/live only in this browser/)
    expect(await within(r).findByText(/None yet/)).toBeTruthy()
  })

  it('says plainly when there is nothing to back up', async () => {
    const user = userEvent.setup()
    const r = await openSettings()
    await user.click(within(r).getByRole('button', { name: /Save a restore point/ }))
    expect((await within(r).findByRole('alert')).textContent).toMatch(/no projects to back up/)
  })

  it('saves a named restore point and lists it with its size, count and kind', async () => {
    const user = userEvent.setup()
    await createProject({ name: 'A' }); await createProject({ name: 'B' })
    const r = await openSettings()
    await user.type(within(r).getByLabelText(/Name \(optional\)/), 'Before the refactor')
    await user.click(within(r).getByRole('button', { name: /Save a restore point/ }))
    expect(await within(r).findByText(/Saved a restore point of 2 projects/)).toBeTruthy()
    const item = within(await within(r).findByRole('list', { name: 'Restore points' })).getAllByRole('listitem')[0]
    expect(item.textContent).toContain('Before the refactor')
    expect(item.textContent).toContain('Saved by you')
    expect(item.textContent).toMatch(/2 projects · [\d.]+ (KB|B)/)
  })

  it('downloads a backup file and a restore point', async () => {
    const user = userEvent.setup()
    const blobs: Blob[] = []; const names: string[] = []
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x' }) as never
    URL.revokeObjectURL = vi.fn() as never
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download) })
    await createProject({ name: 'A' })
    await createSnapshot('manual', 'one')
    const r = await openSettings()
    await user.click(within(r).getByRole('button', { name: /Download a backup file/ }))
    expect(names[0]).toMatch(/^aemora-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(JSON.parse(await blobs[0].text()).format).toBe('aemora.backup')
    await user.click(await within(r).findByRole('button', { name: 'Download one' }))
    expect(names[1]).toMatch(/^aemora-restore-point-/)
    expect(JSON.parse(await blobs[1].text()).projects).toHaveLength(1)
  })

  it('restores a restore point as copies without touching what exists', async () => {
    const user = userEvent.setup()
    await createProject({ name: 'Alpha' })
    await createSnapshot('manual', 'snap')
    const r = await openSettings()
    await user.click(await within(r).findByRole('button', { name: 'Restore snap' }))
    const group = await within(r).findByRole('group', { name: 'Restore snap' })
    expect((within(group).getByLabelText(/Add as copies/) as HTMLInputElement).checked).toBe(true)
    await user.click(within(group).getByRole('button', { name: 'Restore' }))
    expect(await within(r).findByText(/Restored: 1 project added/)).toBeTruthy()
    expect((await listProjects()).map((p) => p.name).sort()).toEqual(['Alpha', 'Alpha (imported)'])
  })

  it('replaces everything on request, keeps a safety restore point, and shows it', async () => {
    const user = userEvent.setup()
    const a = await createProject({ name: 'Alpha' })
    await createSnapshot('manual', 'good')
    await mutateProject(a.id, (x) => ({ ...x, name: 'Ruined' }))
    await createProject({ name: 'Extra' })
    const r = await openSettings()
    await user.click(await within(r).findByRole('button', { name: 'Restore good' }))
    const group = await within(r).findByRole('group', { name: 'Restore good' })
    await user.click(within(group).getByLabelText(/Replace everything/))
    await user.click(within(group).getByRole('button', { name: 'Restore' }))
    expect(await within(r).findByText(/Replaced your projects with the backup: 1 project\./)).toBeTruthy()
    expect((await listProjects()).map((p) => p.name)).toEqual(['Alpha'])
    const list = await within(r).findByRole('list', { name: 'Restore points' })
    await waitFor(() => expect(within(list).getByText('Before a restore')).toBeTruthy())
    expect((await listSnapshots()).find((s) => s.kind === 'before-restore')!.projectCount).toBe(2)
  })

  it('restores from a chosen file, with the same choice', async () => {
    const user = userEvent.setup()
    await createProject({ name: 'One' })
    const file = new File([await exportBackupJson()], 'my-backup.json', { type: 'application/json' })
    await db.projects.clear()
    const r = await openSettings()
    await user.upload(within(r).getByLabelText('Choose a backup file to restore'), file)
    const group = await within(r).findByRole('group', { name: 'Restore from file' })
    expect(group.textContent).toContain('my-backup.json')
    await user.click(within(group).getByRole('button', { name: 'Restore' }))
    expect(await within(r).findByText(/Restored: 1 project added/)).toBeTruthy()
    expect((await listProjects()).map((p) => p.name)).toEqual(['One'])
  })

  it('reports a bad file clearly and changes nothing', async () => {
    const user = userEvent.setup()
    await createProject({ name: 'Keep' })
    const r = await openSettings()
    await user.upload(within(r).getByLabelText('Choose a backup file to restore'), new File(['{not json'], 'bad.json', { type: 'application/json' }))
    await user.click(await within(await within(r).findByRole('group', { name: 'Restore from file' })).findByRole('button', { name: 'Restore' }))
    expect((await within(r).findByRole('alert')).textContent).toMatch(/not valid JSON/)
    expect((await listProjects()).map((p) => p.name)).toEqual(['Keep'])
  })

  it('deletes a restore point', async () => {
    const user = userEvent.setup()
    await createProject({ name: 'A' })
    await createSnapshot('manual', 'temp')
    const r = await openSettings()
    await user.click(await within(r).findByRole('button', { name: 'Delete temp' }))
    expect(await within(r).findByText('Deleted the restore point.')).toBeTruthy()
    await waitFor(async () => expect(await listSnapshots()).toEqual([]))
  })
})

describe('automatic restore point', () => {
  it('is made when the app opens with projects that have not been protected yet', async () => {
    await createProject({ name: 'Protect me' })
    render(<MemoryRouter initialEntries={['/app']}><AppRoutes /></MemoryRouter>)
    await waitFor(async () => expect((await listSnapshots()).map((s) => s.kind)).toEqual(['auto']))
  })
  it('is not made on the landing page, or with nothing to protect', async () => {
    render(<MemoryRouter initialEntries={['/app']}><AppRoutes /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 100))
    expect(await listSnapshots()).toEqual([])
  })
})
