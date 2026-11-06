import { beforeEach, describe, expect, it } from 'vitest'
import { makeComponent, makeProperty } from '../../components/factory'
import { setOverrides } from '../../mapping/ops'
import { createProject, mutateProject } from '../../projects/repo'
import { db } from '../../projects/db'
import { readZip } from '../../../test/zipReader'
import { buildBundle } from '../bundle'
import script from './showhide.js?raw'

// The script is a plain file meant for AEM, so the test runs it the way a page would.
// eslint-disable-next-line no-eval
const run = () => { (window as unknown as { aemoraShowHide?: boolean }).aemoraShowHide = false; (0, eval)(script) }

/** The shape AEM renders: a form, with each field and its label in a wrapper. */
const dialog = (html: string) => { document.body.innerHTML = `<form>${html}</form>` }
const wrap = (inner: string, cls = '') => `<div class="coral-Form-fieldwrapper ${cls}"><label>x</label>${inner}</div>`
const hidden = (id: string) => document.getElementById(id)!.closest('.coral-Form-fieldwrapper')!.classList.contains('hide')

describe('the show/hide script', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('starts a checkbox target hidden, shows it when checked and hides it again', () => {
    dialog(`${wrap('<input type="checkbox" id="c" class="cq-dialog-checkbox-showhide" data-cq-dialog-checkbox-showhide-target=".icon-showhide-target">')}
            ${wrap('<select id="t" class="hide icon-showhide-target" data-showhidetargetvalue="true"></select>')}`)
    run()
    expect(hidden('t')).toBe(true)
    expect(document.getElementById('t')!.classList.contains('hide')).toBe(false) // the wrapper carries the state now
    const c = document.getElementById('c') as HTMLInputElement
    c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }))
    expect(hidden('t')).toBe(false)
    c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }))
    expect(hidden('t')).toBe(true)
  })

  it('a checkbox that is already checked shows its target straight away', () => {
    dialog(`${wrap('<input type="checkbox" id="c" checked class="cq-dialog-checkbox-showhide" data-cq-dialog-checkbox-showhide-target=".x-target">')}
            ${wrap('<input id="t" class="hide x-target">')}`)
    run()
    expect(hidden('t')).toBe(false)
  })

  it('a select shows only the targets whose value matches', () => {
    dialog(`${wrap('<select id="k" class="cq-dialog-dropdown-showhide" data-cq-dialog-dropdown-showhide-target=".kind-target"><option value="plain" selected>plain</option><option value="icon">icon</option></select>')}
            ${wrap('<input id="a" class="hide kind-target" data-showhidetargetvalue="plain">')}
            ${wrap('<input id="b" class="hide kind-target" data-showhidetargetvalue="icon">')}`)
    run()
    expect([hidden('a'), hidden('b')]).toEqual([false, true])
    const k = document.getElementById('k') as HTMLSelectElement
    k.value = 'icon'; k.dispatchEvent(new Event('change', { bubbles: true }))
    expect([hidden('a'), hidden('b')]).toEqual([true, false])
  })

  it('works on a target with no wrapper, ignores other forms, and is safe to load twice', () => {
    document.body.innerHTML = `<form><input type="checkbox" id="c" class="cq-dialog-checkbox-showhide" data-cq-dialog-checkbox-showhide-target=".t"><input id="t" class="hide t"></form><form><input id="other" class="t"></form>`
    run(); run()
    const t = document.getElementById('t')!
    expect(t.classList.contains('hide')).toBe(true)
    expect(document.getElementById('other')!.classList.contains('hide')).toBe(false) // another dialog's field is left alone
    const c = document.getElementById('c') as HTMLInputElement
    c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }))
    expect(t.classList.contains('hide')).toBe(false)
  })
})

describe('the export carries the script only when it is needed', () => {
  beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })
  const project = async (conditional: boolean) => {
    const c = makeComponent({ name: 'Button', properties: [makeProperty({ key: 'iconLeft', label: 'show icon left', type: 'boolean' }), makeProperty({ key: 'leftIcon', label: 'left icon', type: 'enum', allowedValues: ['1'] })] })
    const ms = conditional ? setOverrides([], c, c.properties[1], { showWhen: { propertyId: c.properties[0].id } }) : []
    const p = await createProject({ name: 'Teaser Site' })
    return mutateProject(p.id, (x) => ({ ...x, components: [c], mappings: ms }))
  }

  it('adds a clientlib folder to the ZIP, laid out for AEM, and explains it in the README', async () => {
    const { zip } = buildBundle(await project(true))
    const files = readZip(zip)
    const paths = files.map((f) => f.name)
    const root = 'jcr_root/apps/teaser-site/clientlibs/clientlib-dialog-showhide'
    for (const f of ['.content.xml', 'js.txt', 'css.txt', 'js/showhide.js', 'css/showhide.css']) expect(paths).toContain(`${root}/${f}`)
    const text = (n: string) => files.find((f) => f.name === n)!.text
    expect(files.every((f) => f.crcOk)).toBe(true)
    expect(text(`${root}/.content.xml`)).toMatch(/cq:ClientLibraryFolder/)
    expect(text(`${root}/.content.xml`)).toMatch(/categories="\[cq.authoring.dialog\]"/)
    expect(text(`${root}/js.txt`)).toBe('#base=js\nshowhide.js\n')
    expect(text(`${root}/js/showhide.js`)).toBe(script)
    expect(text('README.txt')).toMatch(/CONDITIONAL FIELDS \(SHOW ONLY WHEN\)/)
  })

  it('adds nothing when no dialog uses conditions', async () => {
    const { zip } = buildBundle(await project(false))
    const files = readZip(zip)
    expect(files.some((f) => f.name.includes('clientlibs'))).toBe(false)
    expect(files.find((f) => f.name === 'README.txt')!.text).not.toMatch(/CONDITIONAL FIELDS/)
  })

  it('the Export tab says so, and says single-file downloads do not include it', async () => {
    const { render, screen } = await import('@testing-library/react')
    const userEvent = (await import('@testing-library/user-event')).default
    const { MemoryRouter } = await import('react-router-dom')
    const { AppRoutes } = await import('../../../App')
    const p = await project(true)
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    await userEvent.setup().click(await screen.findByRole('tab', { name: /^Export/ }))
    const note = (await screen.findAllByText(/show only when” fields/))[0].closest('p')!
    expect(note.textContent).toMatch(/clientlib-dialog-showhide/)
    expect(note.textContent).toMatch(/single XML file does not include it/)
  })
})
