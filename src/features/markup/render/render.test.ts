import { describe, expect, it } from 'vitest'
import { importDesignMd, parseDesignMdText } from '../../inputs/designmd/parse'
import { makeProperty } from '../../components/factory'
import { generateMarkup } from '../index'
import { modifier } from '../naming'
import { evaluate, ExprError, splitOptions, truthy } from './expr'
import { renderHtl } from './render'
import { sanitizeHtml } from './sanitize'
import { buildModel, defaultSamples, PLACEHOLDER_IMAGE } from './samples'

const raw = import.meta.glob('../../../test/fixtures/designmd-rayna.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const catalog = parseDesignMdText(Object.values(raw)[0])
const imported = (name: string) => importDesignMd(catalog, [catalog.entries.find((e) => e.name === name)!.id]).components[0]
const html = (el: Element | DocumentFragment) => (el instanceof Element ? el.outerHTML : [...el.childNodes].map((n) => (n as Element).outerHTML ?? n.textContent).join(''))

describe('expressions', () => {
  const model = { a: 'x', empty: '', n: 0, on: true, list: [] as string[], size: 'lg' }
  it.each([
    ["model.a == 'x'", true], ["model.a != 'x'", false], ["model.a == 'y' || model.size == 'lg'", true], ['model.a && model.on', true],
    ['model.a && model.empty', ''], ['!model.empty', true], ['!(model.on && model.a)', false], ["(model.a == 'y' || model.on) && model.size == 'lg'", true],
    ['model.missing', undefined], ['other.a', undefined], ['true', true], ['model.on == false', false], ['model.n', 0],
  ])('%s', (src, expected) => expect(evaluate(src, model)).toEqual(expected))
  it('treats empty text, zero, false, nothing and an empty list as false', () => {
    for (const v of ['', 0, false, null, undefined, []]) expect(truthy(v)).toBe(false)
    for (const v of ['a', 1, true, ['x']]) expect(truthy(v)).toBe(true)
  })
  it('refuses anything it does not know, so nothing is guessed', () => {
    for (const bad of ["model.a(", "model['a']", 'model.a + 1', "model.a ? 1 : 2", "'open", '(model.a', 'model.a model.b', '']) expect(() => evaluate(bad, model), bad).toThrow(ExprError)
  })
  it('cannot reach inherited properties or the global scope', () => {
    expect(evaluate('model.constructor', model)).toBeUndefined()
    expect(evaluate('model.__proto__', model)).toBeUndefined()
    expect(evaluate('window.location', model)).toBeUndefined()
  })
  it('reads the html option', () => {
    expect(splitOptions("model.body @ context='html'")).toEqual({ expr: 'model.body', html: true })
    expect(splitOptions('model.body')).toEqual({ expr: 'model.body', html: false })
    expect(splitOptions("model.a == '@'")).toEqual({ expr: "model.a == '@'", html: false })
  })
})

describe('rendering the generated HTL', () => {
  const button = imported('Button / primary')
  const htl = generateMarkup(button).files[0].content
  const render = (over: Record<string, string | boolean | number> = {}) => renderHtl(htl, buildModel(button.properties, { ...defaultSamples(button.properties), ...over }))
  const root = (r: ReturnType<typeof render>) => r.body.firstElementChild!

  it('shows the root with the right modifier classes and the label from the model', () => {
    const r = render()
    expect(r.problems).toEqual([])
    expect(root(r).tagName).toBe('BUTTON')
    expect(root(r).className).toBe('cmp-button-primary cmp-button-primary--size-sm cmp-button-primary--icon-style-none')
    expect(root(r).textContent?.trim()).toBe('Label')
    expect(root(r).getAttribute('aria-label')).toBe('Label')
    expect(r.body.querySelector('[data-sly-use\\.model], sly')).toBeNull()
  })
  it('puts the icon before or after the label as the option says, and leaves it out for none', () => {
    const order = (v: string) => [...root(render({ iconStyle: v })).querySelectorAll('span.cmp-button-primary__label, span.cmp-button-primary__button-icon')].map((e) => e.className.replace('cmp-button-primary__', ''))
    expect(order('none')).toEqual(['label'])
    expect(order('leading icon')).toEqual(['button-icon', 'label'])
    expect(order('trailing icon')).toEqual(['label', 'button-icon'])
  })
  it('leaves out text that is empty, and follows the size option', () => {
    expect(render({ label: '' }).body.querySelector('.cmp-button-primary__label')).toBeNull()
    expect(root(render({ size: 'lg' })).className).toContain('cmp-button-primary--size-lg')
  })
  it('shows icon names as data attributes, and escapes typed text', () => {
    const r = render({ icon: 'arrow', iconStyle: 'leading icon', label: '<img src=x onerror=alert(1)> & co' })
    expect(r.body.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('arrow')
    expect(r.body.querySelector('.cmp-button-primary__label')?.innerHTML).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; co')
    expect(r.body.querySelector('img')).toBeNull()
  })
  it('drops an attribute whose only expression is empty, and keeps a true one empty', () => {
    const r = renderHtl('<a href="${model.link}" data-x="${model.on}" title="a ${model.t} b">x</a>', { link: '', on: true, t: 'T' })
    const a = r.body.firstElementChild!
    expect(a.hasAttribute('href')).toBe(false)
    expect(a.getAttribute('data-x')).toBe('')
    expect(a.getAttribute('title')).toBe('a T b')
  })
  it('renders rich text as cleaned markup and plain values as text', () => {
    const r = renderHtl("<div>${model.body @ context='html'}</div><p>${model.body}</p>", { body: '<p onclick="x()">hi <script>bad()</script><b>there</b></p>' })
    expect(html(r.body)).toContain('<div><p>hi <b>there</b></p></div>')
    expect(r.body.querySelector('script')).toBeNull()
    expect(r.body.querySelector('p p')?.textContent ?? r.body.lastElementChild?.textContent).toContain('<p onclick')
  })
  it('says what it cannot do instead of guessing', () => {
    const r = renderHtl('<ul data-sly-list="${model.items}"><li>${item}</li></ul><p data-sly-test="${model.a +}">x</p><span>${model.a ? 1 : 2}</span>', { a: 'x' })
    expect(r.problems.some((p) => /data-sly-list is not supported/.test(p))).toBe(true)
    expect(r.problems.filter((p) => /Could not evaluate/.test(p))).toHaveLength(2)
  })
  it('renders every fixture component without problems', () => {
    for (const e of catalog.entries) {
      const c = importDesignMd(catalog, [e.id]).components[0]
      const r = renderHtl(generateMarkup(c).files[0].content, buildModel(c.properties, defaultSamples(c.properties)))
      expect(r.problems, e.name).toEqual([])
      expect(r.body.firstElementChild, e.name).toBeTruthy()
    }
  })
})

describe('sample values', () => {
  it('start from the design defaults and use plain stand-ins otherwise', () => {
    const s = defaultSamples([
      makeProperty({ key: 'title', label: 'Title', type: 'string' }), makeProperty({ key: 'on', label: 'On', type: 'boolean', defaultValue: true }),
      makeProperty({ key: 'size', label: 'Size', type: 'enum', allowedValues: ['s', 'l'] }), makeProperty({ key: 'pic', label: 'Pic', type: 'image' }),
      makeProperty({ key: 'n', label: 'N', type: 'number', defaultValue: 4 }), makeProperty({ key: 'href', label: 'Href', type: 'link' }),
    ])
    expect(s).toEqual({ title: 'Sample title', on: true, size: 's', pic: PLACEHOLDER_IMAGE, n: 4, href: '#' })
  })
  it('make the model with the same class-name form the generated Java produces', () => {
    const props = [makeProperty({ key: 'look', label: 'Look', type: 'enum', allowedValues: [] })]
    for (const v of ['plainText', 'Icon only', '  --Odd__Value!! ', 'ÄÖ 1']) {
      const m = buildModel(props, { look: v })
      expect(m.lookModifier).toBe(modifier(v))
      // The Java: value.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "")
      expect(m.lookModifier).toBe(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    }
  })
  it('use the model name that avoids Java keywords', () => {
    const m = buildModel([makeProperty({ key: 'class', label: 'Class', type: 'string' })], { class: 'x' })
    expect(m).toEqual({ classValue: 'x' })
  })
})

describe('sanitizer', () => {
  const doc = document.implementation.createHTMLDocument('')
  const clean = (s: string) => html(sanitizeHtml(s, doc))
  it('removes scripts, handlers, styles and dangerous elements with their content', () => {
    expect(clean('<p onclick="a()" style="x:y" class="k">ok<script>bad()</script><style>*{}</style><iframe src="//x"></iframe></p>')).toBe('<p class="k">ok</p>')
    expect(clean('<object data="x"></object><form action="x"><input></form><math><mi>x</mi></math>')).toBe('')
  })
  it('keeps content of unknown tags but not the tags', () => {
    expect(clean('<custom-tag><b>x</b></custom-tag>')).toBe('<b>x</b>')
  })
  it('refuses script URLs however they are disguised', () => {
    for (const href of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.example']) {
      expect(clean(`<a href="${href}">x</a>`), href).not.toMatch(/href=/)
    }
    expect(clean('<a href="https://example.com/a?b=1" target="_blank">x</a>')).toBe('<a href="https://example.com/a?b=1" rel="noopener noreferrer">x</a>')
    expect(clean('<a href="#top">x</a><a href="/page">y</a><a href="mailto:a@b.c">z</a>')).toContain('href="/page"')
  })
  it('allows only real pictures as image sources', () => {
    expect(clean(`<img src="${PLACEHOLDER_IMAGE}" alt="a">`)).toContain('src="data:image/png;base64')
    expect(clean('<img src="data:image/svg+xml;base64,PHN2Zz4=">')).toBe('<img>')
    expect(clean('<img src="javascript:x" onerror="y()">')).toBe('<img>')
    expect(clean('<script src="x"></script><a src="https://x">q</a>')).toBe('<a rel="noopener noreferrer">q</a>')
  })
  it('keeps aria and data attributes and limits the type attribute', () => {
    expect(clean('<button type="submit" aria-label="a" data-icon="i" role="x">b</button>')).toBe('<button aria-label="a" data-icon="i" role="x">b</button>')
    expect(clean('<input type="file"><input type="checkbox">')).toBe('<input><input type="checkbox">')
  })

  it('keeps plain vector drawings and nothing that can act', () => {
    const svg = '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M0 0L10 10Z" fill="currentColor" fill-rule="evenodd"></path></svg>'
    expect(clean(svg)).toBe(svg)
    // Handlers, styles, references, scripts and anything outside the drawing tags go.
    expect(clean('<svg onload="a()" style="x:y"><circle cx="1" cy="1" r="1" onclick="b()" fill="#fff"></circle></svg>')).toBe('<svg><circle cx="1" cy="1" r="1" fill="#fff"></circle></svg>')
    expect(clean('<svg><script>bad()</script><style>*{}</style><foreignObject><div>x</div></foreignObject><use href="#a"></use><image href="x"></image><animate attributeName="x"></animate></svg>')).toBe('<svg></svg>')
    expect(clean('<svg><path d="M0 0" fill="url(#g)"></path><path d="javascript:alert(1)"></path><path d="M0 0" stroke="red" transform="rotate(5) translate(1 2)"></path></svg>')).toBe('<svg><path d="M0 0"></path><path></path><path d="M0 0" stroke="red" transform="rotate(5) translate(1 2)"></path></svg>')
  })
  it('keeps HTML links outside a drawing', () => {
    expect(clean('<a href="/p">go</a><svg><a href="/p"><path d="M0 0"></path></a></svg>')).toBe('<a href="/p" rel="noopener noreferrer">go</a><svg></svg>')
  })
})
