import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../App'
import { db } from '../../projects/db'
import { createProject } from '../../projects/repo'
import { ComponentSchema } from '../../components/schema'
import { parseComponentJson } from '../json'
import { InputError } from '../types'
import { importDesignMd, mergeCatalogs, parseDesignMdText, MAX_DESIGNMD_IMPORT } from './parse'

const files = import.meta.glob('../../../test/fixtures/designmd-*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const rayna = files['../../../test/fixtures/designmd-rayna.json']
const example = files['../../../test/fixtures/designmd-example.json']

const byName = (text: string, name: string) => {
  const cat = parseDesignMdText(text)
  const id = cat.entries.find((e) => e.name === name)!.id
  return importDesignMd(cat, [id])
}

describe('DesignMD components.json adapter', () => {
  it('lists the components in the file with their sizes', () => {
    const cat = parseDesignMdText(rayna)
    expect(cat.entries.map((e) => e.name)).toEqual(['Button / primary', 'Dropdown / menu item', 'Input', 'Metrics Card', 'Alert'])
    const button = cat.entries[0]
    expect(button).toMatchObject({ variants: 32, properties: 4 })
    expect(button.layers).toBeGreaterThan(1)
    expect(cat.fileName).toMatch(/Rayna UI/)
  })

  it('turns every component of the real file into a valid canonical component', () => {
    const cat = parseDesignMdText(rayna)
    const res = importDesignMd(cat, cat.entries.map((e) => e.id))
    expect(res.components).toHaveLength(5)
    for (const c of res.components) expect(ComponentSchema.safeParse(c).success).toBe(true)
    expect(res.source.kind).toBe('figma-plugin')
    expect(res.source.label).toMatch(/DesignMD 1\.1\.0/)
  })

  it('maps Button / primary: variants become fields, interaction states do not, the label is suggested', () => {
    const c = byName(rayna, 'Button / primary').components[0]
    expect(c.type).toBe('button')
    const by = (k: string) => c.properties.find((p) => p.key === k)!
    expect(by('size')).toMatchObject({ type: 'enum', defaultValue: 'sm', allowedValues: ['sm', 'lg'] })
    expect(by('iconStyle')).toMatchObject({ type: 'enum', defaultValue: 'none', allowedValues: ['none', 'leading icon', 'trailing icon', 'icon-only'] })
    expect(by('icon')).toMatchObject({ type: 'string' })
    expect(by('icon').description).toMatch(/question-circle/)
    expect(c.properties.some((p) => p.key === 'state')).toBe(false)
    expect(by('label')).toMatchObject({ type: 'string', defaultValue: 'Label', origin: { suggested: true } })
    expect(c.properties.filter((p) => !p.origin.suggested).every((p) => p.origin.ref === c.origin.ref)).toBe(true)
  })

  it('maps text, boolean and swap properties and does not suggest a field twice', () => {
    const c = byName(rayna, 'Dropdown / menu item').components[0]
    const by = (k: string) => c.properties.find((p) => p.key === k)!
    expect(by('menuText')).toMatchObject({ type: 'string', defaultValue: 'Account settings' })
    expect(by('hasCommandMenu')).toMatchObject({ type: 'boolean', defaultValue: true })
    expect(by('hasCheckbox')).toMatchObject({ type: 'boolean', defaultValue: true })
    expect(c.properties.filter((p) => p.origin.suggested)).toHaveLength(0)
    expect(new Set(c.properties.map((p) => p.key)).size).toBe(c.properties.length)
  })

  it('keeps the layer structure and variant differences for the markup generators', () => {
    const c = byName(rayna, 'Button / primary').components[0]
    const design = c.meta.design as { format: string; tree: { name: string; children: unknown[] }; variantDiffs: unknown[]; layout: { gap: number }; states: string[]; sizes: string[] }
    expect(design.format).toBe('designmd.components/v1')
    expect(design.tree.name).toBe('Button / primary')
    expect(design.variantDiffs).toHaveLength(6)
    expect(design.layout.gap).toBe(10)
    expect(design.states).toEqual(['default', 'hover', 'focused', 'de-activated'])
    expect(design.sizes).toEqual(['sm', 'lg'])
  })

  it('explains what it inferred instead of hiding it', () => {
    const w = byName(rayna, 'Button / primary').warnings
    expect(w.some((x) => /interaction states/.test(x.message))).toBe(true)
    expect(w.some((x) => /no Figma property/.test(x.message) && x.where === 'Button / primary › Label')).toBe(true)
    expect(w.some((x) => /No design variables are bound/.test(x.message))).toBe(true)
    expect(w.some((x) => /instance swap/.test(x.message))).toBe(true)
  })

  it('carries only the tokens a component uses, and does not warn when variables are bound', () => {
    const res = byName(example, 'Button')
    const design = res.components[0].meta.design as { tokens: Record<string, { cssName: string }> }
    expect(Object.values(design.tokens).map((t) => t.cssName)).toContain('--color-primary-500')
    expect(Object.keys(design.tokens).length).toBeLessThan(Object.keys(JSON.parse(example).tokens).length + 1)
    expect(res.warnings.some((x) => /No design variables are bound/.test(x.message))).toBe(false)
  })

  it('reports a truncated layer structure as a warning', () => {
    const data = JSON.parse(rayna)
    data.components[2].treeTruncated = true
    const cat = parseDesignMdText(JSON.stringify(data))
    const res = importDesignMd(cat, [cat.entries[2].id])
    expect(res.warnings.some((x) => x.level === 'warning' && /cut off/.test(x.message))).toBe(true)
  })

  it('reads at most the allowed number per import and says so', () => {
    const data = JSON.parse(example)
    const base = data.components[0]
    data.components = Array.from({ length: MAX_DESIGNMD_IMPORT + 5 }, (_, i) => ({ ...base, id: `c${i}`, name: `Button ${i}` }))
    const cat = parseDesignMdText(JSON.stringify(data))
    const res = importDesignMd(cat, cat.entries.map((e) => e.id))
    expect(res.components).toHaveLength(MAX_DESIGNMD_IMPORT)
    expect(res.warnings.some((w) => /first 50/.test(w.message))).toBe(true)
  })

  it('keeps a variant with hundreds of options valid by cutting the list and saying so', () => {
    const data = JSON.parse(example)
    data.components[0].properties.push({ key: 'country', name: 'country', type: 'VARIANT', defaultValue: 'o0', variantOptions: Array.from({ length: 250 }, (_, i) => `o${i}`) })
    const cat = parseDesignMdText(JSON.stringify(data))
    const res = importDesignMd(cat, [cat.entries[0].id])
    const p = res.components[0].properties.find((x) => x.key === 'country')!
    expect(p.allowedValues).toHaveLength(200)
    expect(ComponentSchema.safeParse(res.components[0]).success).toBe(true)
    expect(res.warnings.some((w) => /250 options/.test(w.message))).toBe(true)
  })

  it('skips a component that cannot be read and imports the others', () => {
    const data = JSON.parse(example)
    data.components.push({ id: 'bad', name: 'Broken', properties: 'nope' })
    const cat = parseDesignMdText(JSON.stringify(data))
    const res = importDesignMd(cat, cat.entries.map((e) => e.id))
    expect(res.components.map((c) => c.name)).toEqual(['Button'])
    expect(res.warnings.some((w) => w.where === 'Broken' && /skipped/.test(w.message))).toBe(true)
  })

  it('merges several per-component files without duplicates', () => {
    const one = (name: string) => { const d = JSON.parse(rayna); d.components = d.components.filter((c: { name: string }) => c.name === name); return parseDesignMdText(JSON.stringify(d)) }
    const merged = mergeCatalogs([one('Input'), one('Alert'), one('Input')])
    expect(merged.entries.map((e) => e.name)).toEqual(['Input', 'Alert'])
  })

  it('rejects other input with a message that says what to do', () => {
    expect(() => parseDesignMdText('nope')).toThrow(/not valid JSON/)
    expect(() => parseDesignMdText('')).toThrow(/Nothing to import/)
    expect(() => parseDesignMdText('{"schema":"aemora.components/v1","components":[]}')).toThrow(/aemora\.components\/v1/)
    expect(() => parseDesignMdText('{"components":[]}')).toThrow(/not a DesignMD components file/)
    expect(() => parseDesignMdText('{"schema":"designmd.components/v1","index":{"componentCount":900},"components":[]}')).toThrow(/components" folder/)
    expect(() => parseDesignMdText('{"schema":"designmd.components/v1","components":[]}')).toThrow(InputError)
  })

  it('points the JSON tab at the DesignMD tab', () => {
    expect(() => parseComponentJson(example)).toThrow(/DesignMD tab/)
  })

  it('removes prototype-polluting keys while reading', () => {
    const data = JSON.parse(example)
    const text = JSON.stringify(data).replace('"layout"', '"__proto__":{"polluted":true},"layout"')
    parseDesignMdText(text)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

describe('DesignMD tab', () => {
  it('picks components from a file, reviews them, and adds them to the project', async () => {
    const user = userEvent.setup()
    const p = await createProject({ name: 'Rayna' })
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Bring in a design' }))
    await screen.findByRole('dialog', { name: 'Bring in a design' })
    await user.click(screen.getByRole('tab', { name: 'DesignMD' }))
    await user.upload(screen.getByLabelText('Choose DesignMD components file'), new File([rayna], 'components.json', { type: 'application/json' }))

    const picker = await screen.findByRole('region', { name: 'Choose components' })
    const list = within(picker).getByRole('list', { name: 'Components in the file' })
    expect(within(list).getAllByRole('checkbox')).toHaveLength(5)
    expect((within(picker).getByRole('button', { name: /Review/ }) as HTMLButtonElement).disabled).toBe(true)

    await user.type(within(picker).getByRole('searchbox', { name: 'Search components' }), 'butt')
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1)
    await user.click(within(picker).getByRole('button', { name: 'Select shown' }))
    await user.click(within(picker).getByRole('button', { name: 'Review 1 selected' }))

    const review = await screen.findByRole('region', { name: 'Import review' })
    expect(within(review).getByText('Button / primary')).toBeTruthy()
    expect(within(review).getByText(/interaction states/)).toBeTruthy()
    await user.click(within(review).getByRole('button', { name: /Add 1 component to project/ }))
    await waitFor(async () => {
      const saved = (await db.projects.get(p.id))!.components
      expect(saved).toHaveLength(1)
      expect((saved[0].meta.design as { tree: unknown }).tree).toBeTruthy()
    })
  })

  it('shows a clear error for a file that is not a DesignMD export', async () => {
    const user = userEvent.setup()
    const p = await createProject({ name: 'Rayna' })
    render(<MemoryRouter initialEntries={[`/app/generator/${p.id}`]}><AppRoutes /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: 'Bring in a design' }))
    await user.click(await screen.findByRole('tab', { name: 'DesignMD' }))
    await user.upload(screen.getByLabelText('Choose DesignMD components file'), new File(['{"hello":1}'], 'x.json', { type: 'application/json' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a DesignMD components file/)
    expect(screen.queryByRole('region', { name: 'Choose components' })).toBeNull()
  })
})
