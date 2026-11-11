import { makeComponent, makeProperty } from '../components/factory'
import type { ComponentDef, Property } from '../components/schema'
import { buildDialog } from '../dialog/ops'
import { setConstraint, setFieldType, setMultifield, patchSubfield, addSubfield } from '../mapping/ops'
import type { Mapping } from '../mapping/schema'
import { ProjectSchema, SCHEMA_VERSION, type Project } from '../projects/schema'
import { accordionDesign, buttonDesign, cardDesign, containerDesign, imageDesign, tabsDesign, textDesign } from './sampleDesign'

export const SAMPLE_ID = 'sample'
const T = '2025-01-01T09:00:00.000Z'

/** Stable ids, so the sample renders the same every time and links to it never break. */
const prop = (comp: string, key: string, label: string, type: Property['type'], extra: Partial<Property> = {}): Property =>
  makeProperty({ id: `${comp}-${key}`, key, label, type, origin: { kind: 'json', suggested: false }, ...extra })

function build(): Project {
  const button: ComponentDef = makeComponent({
    id: 'sample-button', name: 'Button', type: 'button', description: 'A call to action. Designers describe size and variant; authors set the text and where it goes.',
    properties: [
      prop('button', 'label', 'Label', 'string', { required: true, defaultValue: 'Learn more', description: 'The visible text on the button.', group: 'Content' }),
      prop('button', 'link', 'Link', 'link', { description: 'The page or URL the button opens.', group: 'Content › Link' }),
      prop('button', 'size', 'Size', 'enum', { allowedValues: ['small', 'medium', 'large'], defaultValue: 'medium', group: 'Style' }),
      prop('button', 'variant', 'Variant', 'enum', { allowedValues: ['primary', 'secondary', 'tertiary'], defaultValue: 'primary', group: 'Style' }),
      prop('button', 'iconPosition', 'Icon position', 'enum', { allowedValues: ['none', 'left', 'right'], defaultValue: 'none', group: 'Style' }),
      prop('button', 'accessibilityLabel', 'Accessibility label', 'string', { description: 'Read by screen readers instead of the label.', group: 'Accessibility' }),
    ],
  })

  const card: ComponentDef = makeComponent({
    id: 'sample-card', name: 'Card', type: 'card', description: 'A teaser with an image, text and one button. The button is not a new component: the card exposes three of its properties.',
    properties: [
      prop('card', 'heading', 'Heading', 'string', { required: true, description: 'Keep it under 60 characters.', group: 'Content' }),
      prop('card', 'description', 'Description', 'text', { group: 'Content' }),
      prop('card', 'image', 'Image', 'image', { description: 'Pick an asset from the DAM.', group: 'Content › Media' }),
      prop('card', 'imageAlt', 'Image description', 'string', { description: 'Alternative text for the image.', group: 'Content › Media' }),
      prop('card', 'ctaLabel', 'Button label', 'string', { defaultValue: 'Read more', group: 'Content › Button' }),
      prop('card', 'ctaLink', 'Button link', 'link', { group: 'Content › Button' }),
      prop('card', 'backgroundVariant', 'Background variant', 'enum', { allowedValues: ['default', 'subtle', 'accent'], defaultValue: 'default', group: 'Style' }),
      prop('card', 'alignment', 'Alignment', 'enum', { allowedValues: ['left', 'center'], defaultValue: 'left', group: 'Style' }),
      prop('card', 'showDescription', 'Show description', 'boolean', { defaultValue: true, description: 'Optional content: hide the description on compact cards.', group: 'Style' }),
    ],
    children: [{ name: 'Primary Button', approach: 'expose-properties', exposedKeys: ['label', 'link', 'variant'] }],
  })

  const image: ComponentDef = makeComponent({
    id: 'sample-image', name: 'Image', type: 'image', description: 'An image with alternative text. Uses a file upload instead of the suggested path field.',
    properties: [
      prop('image', 'asset', 'Image', 'image', { required: true, description: 'Drop an image here or choose one from the DAM.' }),
      prop('image', 'altText', 'Alt text', 'string', { description: 'Describes the image for screen readers. Leave empty if the image is decorative.' }),
      prop('image', 'decorative', 'Decorative image', 'boolean', { defaultValue: false }),
      prop('image', 'displayVariant', 'Display variant', 'enum', { allowedValues: ['default', 'rounded', 'cover'], defaultValue: 'default' }),
    ],
  })

  const text: ComponentDef = makeComponent({
    id: 'sample-text', name: 'Text', type: 'text', description: 'Formatted text with a heading level.',
    properties: [
      prop('text', 'text', 'Text', 'richtext', { required: true, group: 'Content' }),
      prop('text', 'headingLevel', 'Heading level', 'enum', { allowedValues: ['h1', 'h2', 'h3', 'h4', 'p'], defaultValue: 'p', group: 'Style' }),
      prop('text', 'alignment', 'Alignment', 'enum', { allowedValues: ['left', 'center', 'right'], defaultValue: 'left', group: 'Style' }),
    ],
  })

  const container: ComponentDef = makeComponent({
    id: 'sample-container', name: 'Container', type: 'container', description: 'Lays out other content. Repeated links use a multifield with a label, a URL and an "opens in a new tab" option.',
    properties: [
      prop('container', 'layout', 'Layout', 'enum', { allowedValues: ['stack', 'row', 'grid'], defaultValue: 'stack', group: 'Layout' }),
      prop('container', 'spacing', 'Spacing', 'enum', { allowedValues: ['none', 'small', 'medium', 'large'], defaultValue: 'medium', group: 'Layout' }),
      prop('container', 'links', 'Links', 'list', { description: 'Repeated links shown under the container.', group: 'Links' }),
    ],
    children: [{ name: 'Content', approach: 'reference-component', exposedKeys: [] }],
    unsupported: [{
      id: 'sample-container-u1', name: 'Content', rawType: 'INSTANCE_SWAP', reason: 'Instance swap picks another component. There is no single AEM field for that. Reference an independently authored component, or expose selected properties of the child.',
      origin: { kind: 'figma-rest', suggested: false },
    }],
  })

  const accordion: ComponentDef = makeComponent({
    id: 'sample-accordion', name: 'Accordion', type: 'custom', description: 'Items that open and close. Authors write each item and choose which ones start open.',
    properties: [
      prop('accordion', 'firstTitle', 'First title', 'string', { required: true, defaultValue: 'What is Aemora?', group: 'First item' }),
      prop('accordion', 'firstContent', 'First content', 'text', { defaultValue: 'It turns a design component into an AEM dialog.', group: 'First item' }),
      prop('accordion', 'firstOpen', 'First item open', 'boolean', { defaultValue: true, description: 'Whether the first item starts open.', group: 'First item' }),
      prop('accordion', 'secondTitle', 'Second title', 'string', { defaultValue: 'Does it need a server?', group: 'Second item' }),
      prop('accordion', 'secondContent', 'Second content', 'text', { defaultValue: 'No. It runs in your browser.', group: 'Second item' }),
      prop('accordion', 'secondOpen', 'Second item open', 'boolean', { defaultValue: false, group: 'Second item' }),
      prop('accordion', 'style', 'Style', 'enum', { allowedValues: ['default', 'boxed'], defaultValue: 'default', group: 'Style' }),
      prop('accordion', 'allowMultiple', 'Allow several open', 'boolean', { defaultValue: false, description: 'Lets visitors keep more than one item open. A behaviour, not a look.', group: 'Behaviour' }),
    ],
    children: [{ name: 'Accordion item', approach: 'reference-component', exposedKeys: [] }],
  })

  const tabs: ComponentDef = makeComponent({
    id: 'sample-tabs', name: 'Tabs', type: 'custom', description: 'A strip of tabs over a panel. Authors name the tabs and choose which one is open first.',
    properties: [
      prop('tabs', 'tab1Label', 'Tab 1 label', 'string', { required: true, defaultValue: 'Overview', group: 'Tabs' }),
      prop('tabs', 'tab2Label', 'Tab 2 label', 'string', { required: true, defaultValue: 'Details', group: 'Tabs' }),
      prop('tabs', 'tab3Label', 'Tab 3 label', 'string', { defaultValue: 'Reviews', group: 'Tabs' }),
      prop('tabs', 'showThirdTab', 'Show third tab', 'boolean', { defaultValue: true, description: 'Optional content: drop the third tab on short pages.', group: 'Tabs' }),
      prop('tabs', 'style', 'Style', 'enum', { allowedValues: ['line', 'pill'], defaultValue: 'line', group: 'Style' }),
      prop('tabs', 'activeTab', 'Active tab', 'enum', { allowedValues: ['1', '2', '3'], defaultValue: '1', description: 'The tab that is open when the page loads.', group: 'Style' }),
    ],
  })

  // Every sample component carries layers, so each one has a real component preview and real HTL and CSS, and every sample value does something.
  const withDesign = (c: ComponentDef, design: unknown): ComponentDef => ({ ...c, meta: { design } })
  const components = [withDesign(button, buttonDesign()), withDesign(card, cardDesign()), withDesign(image, imageDesign()), withDesign(text, textDesign()), withDesign(container, containerDesign()), withDesign(accordion, accordionDesign()), withDesign(tabs, tabsDesign())]
  const find = (c: ComponentDef, key: string) => c.properties.find((p) => p.key === key)!

  let mappings: Mapping[] = []
  mappings = setConstraint(mappings, card, find(card, 'heading'), 'maxlength', 60)
  mappings = setFieldType(mappings, card, find(card, 'showDescription'), 'switch').mappings
  mappings = setFieldType(mappings, tabs, find(tabs, 'showThirdTab'), 'switch').mappings
  mappings = setFieldType(mappings, image, find(image, 'asset'), 'fileupload').mappings
  const links = find(container, 'links')
  mappings = setMultifield(mappings, container, links, { composite: true })
  const mfId = () => mappings.find((m) => m.propertyId === links.id)!.multifield!.subfields
  mappings = patchSubfield(mappings, container, links, mfId()[1].id, { key: 'url', label: 'URL' })
  mappings = addSubfield(mappings, container, links)
  mappings = patchSubfield(mappings, container, links, mfId()[2].id, { key: 'newTab', label: 'Open in a new tab', fieldType: 'checkbox' })
  // Subfield ids come from newId(); pin them so the sample never changes between loads.
  mappings = mappings.map((m) => m.multifield ? { ...m, id: `sample-map-${m.propertyId}`, multifield: { ...m.multifield, subfields: m.multifield.subfields.map((s, i) => ({ ...s, id: `sample-sub-${i}` })) } } : { ...m, id: `sample-map-${m.propertyId}` })

  return ProjectSchema.parse({
    schemaVersion: SCHEMA_VERSION, id: SAMPLE_ID, name: 'Sample: component library',
    description: 'A read-only tour: seven components, with mappings, a laid-out dialog and generated XML. Every component also has layers, so the Preview and Markup tabs show a real component with options and states. Open any tab to see how it works.',
    aemComponentName: '', inputSource: { kind: 'json', label: 'Built-in sample' },
    components, mappings,
    dialog: { components: { [card.id]: buildDialog(card) } },
    generatedXml: {}, validation: [], createdAt: T, updatedAt: T,
  })
}

let cached: Project | null = null
/** The sample project. Built once, validated against the real schema, never written to storage. */
export function sampleProject(): Project {
  cached ??= build()
  return cached
}
