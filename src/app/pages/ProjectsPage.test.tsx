import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../App'
import { db } from '../../features/projects/db'
import { createProject, exportProjectJson } from '../../features/projects/repo'

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })
const at = (path = '/app') => render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)

describe('Projects dashboard', () => {
  it('shows an empty state with a way forward', async () => {
    at()
    expect(await screen.findByText('No projects yet')).toBeTruthy()
    expect((screen.getByRole('button', { name: /export backup/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates a project from the drawer, validates input, and opens it', async () => {
    const user = userEvent.setup()
    at()
    await user.click(await screen.findByRole('button', { name: /new project/i }))
    const dialog = await screen.findByRole('dialog', { name: 'New project' })
    await user.click(within(dialog).getByRole('button', { name: /create project/i }))
    expect(await within(dialog).findByText('Project name is required')).toBeTruthy()
    await user.type(within(dialog).getByRole('textbox', { name: 'Project name' }), 'Card teaser')
    await user.type(within(dialog).getByRole('textbox', { name: 'AEM component name' }), 'Bad Name')
    await user.click(within(dialog).getByRole('button', { name: /create project/i }))
    expect(await within(dialog).findByText(/lowercase letters/)).toBeTruthy()
    await user.clear(within(dialog).getByRole('textbox', { name: 'AEM component name' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'AEM component name' }), 'card-teaser')
    await user.click(within(dialog).getByRole('button', { name: /create project/i }))
    expect(await screen.findByRole('heading', { name: 'Card teaser' })).toBeTruthy()
    expect((await db.projects.toArray())[0].aemComponentName).toBe('card-teaser')
  })

  it('closes the drawer with Escape', async () => {
    const user = userEvent.setup()
    at()
    await user.click(await screen.findByRole('button', { name: /new project/i }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('renames, duplicates, and deletes with inline confirmation', async () => {
    const user = userEvent.setup()
    await createProject({ name: 'Alpha' })
    at()
    const menu = (name: string, item: string) => user.click(screen.getByRole('button', { name: `More actions for ${name}` })).then(() => user.click(screen.getByRole('menuitem', { name: item })))
    await user.click(await screen.findByRole('button', { name: 'More actions for Alpha' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit project' }))
    const drawer = await screen.findByRole('dialog', { name: 'Edit project' })
    const input = within(drawer).getByLabelText('Project name')
    await user.clear(input)
    await user.type(input, 'Beta')
    await user.type(within(drawer).getByLabelText('Description'), 'Shown in the list')
    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('button', { name: 'Beta' })).toBeTruthy()
    expect(await screen.findByText('Shown in the list')).toBeTruthy()

    await menu('Beta', 'Duplicate')
    expect(await screen.findByRole('button', { name: 'Beta (copy)' })).toBeTruthy()

    await menu('Beta (copy)', 'Delete')
    expect(screen.getByText(/can’t be undone/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await db.projects.count()).toBe(2)
    await menu('Beta (copy)', 'Delete')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await db.projects.count()).toBe(1))
  })

  it('imports a project file and reports a bad file without losing data', async () => {
    const user = userEvent.setup()
    const src = await createProject({ name: 'Imported one' })
    const json = exportProjectJson(src)
    await db.projects.clear()
    await createProject({ name: 'Existing' })
    at()
    const input = await screen.findByLabelText('Import project or backup file')
    await user.upload(input, new File([json], 'p.json', { type: 'application/json' }))
    expect(await screen.findByText(/Imported 1 project/)).toBeTruthy()
    await user.upload(input, new File(['{bad'], 'bad.json', { type: 'application/json' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not valid JSON/)
    expect(await db.projects.count()).toBe(2)
  })

  it('shows a clear page for a project that does not exist', async () => {
    at('/app/generator/missing-id')
    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeTruthy()
  })
})
