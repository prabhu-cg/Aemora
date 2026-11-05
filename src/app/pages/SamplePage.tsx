import { ProjectView } from './ProjectView'
import { sampleProject } from '../../features/sample/sample'

export function SamplePage() {
  return <ProjectView project={sampleProject()} readOnly />
}
