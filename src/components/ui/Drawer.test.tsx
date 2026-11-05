import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Drawer } from './Drawer'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <a href="#behind">Behind the dialog</a>
      <Drawer open={open} title="Edit thing" onClose={() => setOpen(false)}>
        <label>Name <input /></label>
        <button disabled>Disabled one</button>
        <button>Save</button>
      </Drawer>
    </>
  )
}

describe('modal drawer behaviour', () => {
  it('declares itself modal, moves focus in, and puts it back on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Edit thing' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('keeps Tab inside: forward from the last control wraps to the first, and Shift+Tab goes back round', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    const close = screen.getByRole('button', { name: 'Close' })
    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    await user.tab()
    expect(document.activeElement).toBe(close) // first control in the dialog, skipping the disabled one
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(save)
  })

  it('never lets focus escape to the page behind, even if it starts there', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    screen.getByRole('link', { name: 'Behind the dialog' }).focus()
    await user.tab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  it('does not trap Tab when it is closed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('button', { name: 'Open' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Behind the dialog' }))
  })
})
