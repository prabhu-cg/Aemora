import { PageFrame, Upcoming } from './PageFrame'

export function ComponentsPage() {
  return (
    <PageFrame title="Components" lede="Detected design components and their properties, shared across the current project.">
      <Upcoming chunk="chunk 3" items={['Button, Card, Text, Image and Container detection', 'Rename, retype, reorder and group properties']} />
    </PageFrame>
  )
}
