import { useState, type FormEvent } from 'react'
import { Drawer } from '../../components/ui/Drawer'
import { TextArea, TextField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { NewProjectInputSchema } from './schema'
import { createProject } from './repo'
import type { Project } from './schema'

export function NewProjectDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [component, setComponent] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const close = () => {
    setName(''); setDescription(''); setComponent(''); setErrors({})
    onClose()
  }

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
      const p = await createProject(parsed.data)
      setName(''); setDescription(''); setComponent(''); setErrors({})
      onCreated(p)
    } catch {
      setErrors({ form: 'Could not save the project in this browser. Check that site storage is allowed, then try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} title="New project" onClose={close}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField label="Project name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Card teaser" maxLength={140} />
        <TextField
          label="AEM component name"
          value={component}
          onChange={(e) => setComponent(e.target.value)}
          error={errors.aemComponentName}
          hint="Optional. The folder name under /apps/<project>/components."
          placeholder="card-teaser"
        />
        <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} hint="Optional. What authors will configure with this dialog." />
        {errors.form && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-[13px] text-danger">{errors.form}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>Create project</Button>
          <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
        </div>
      </form>
    </Drawer>
  )
}
