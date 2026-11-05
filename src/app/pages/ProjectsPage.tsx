import { PageFrame, Upcoming } from './PageFrame'

export function ProjectsPage() {
  return (
    <PageFrame title="Projects" lede="Every project holds its components, mappings, dialog structure and generated XML, stored locally in this browser.">
      <Upcoming chunk="chunk 1" items={['Create, rename, duplicate and delete projects', 'Import and export project backups', 'Recent projects that survive a refresh']} />
    </PageFrame>
  )
}
