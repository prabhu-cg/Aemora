import { useState, type FormEvent } from 'react'
import { Drawer } from '../../components/ui/Drawer'
import { TextArea, TextField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { NewProjectInputSchema } from './schema'
import { ProjectError, updateProjectDetails } from './repo'
import type { Project } from './schema'

/** Name, description and AEM component name, in the same right-hand drawer as "New project". */
export function EditProjectDrawer({ open, project, onClose, onSaved }: { open: boolean; project: Project; onClose: () => void; onSaved?: (p: Project) => void }) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [component, setComponent] = useState(project.aemComponentName)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [primed, setPrimed] = useState(open)
  // Each time the drawer opens it starts from what is saved, not from an abandoned edit.
  if (open && !primed) { setPrimed(true); setName(project.name); setDescription(project.description); setComponent(project.aemComponentName); setErrors({}) }
  if (!open && primed) setPrimed(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = NewProjectInputSchema.safeParse({ name, description, aemComponentName: component })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message
      setErrors(next)
      return
    }
    setBusy(true)
    try {
      const p = await updateProjectDetails(project.id, parsed.data)
      onSaved?.(p)
      onClose()
    } catch (err) {
      setErrors({ form: err instanceof ProjectError ? err.message : 'Could not save the changes in this browser. Check that site storage is allowed, then try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} title="Edit project" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField label="Project name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={140} />
        <TextField label="AEM component name" value={component} onChange={(e) => setComponent(e.target.value)} error={errors.aemComponentName} hint="Optional. The folder name under /apps/<project>/components." placeholder="card-teaser" />
        <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} hint="Optional. What authors will configure with this dialog." />
        {errors.form && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-[13px] text-danger">{errors.form}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>Save changes</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  )
}
