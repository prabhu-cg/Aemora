import { PageFrame, Upcoming } from './PageFrame'

export function GeneratorPage() {
  return (
    <PageFrame title="Dialog Generator" lede="Input, properties, mapping, dialog structure, preview and XML in one workspace.">
      <Upcoming chunk="chunks 2 to 7" items={['Figma, JSON, screenshot and clipboard input', 'Property inspector and field mapping', 'Two-panel dialog editor with simulated preview', 'XML generation with three validation layers']} />
    </PageFrame>
  )
}
