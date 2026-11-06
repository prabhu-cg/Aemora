/** An image on the clipboard or in a drop, such as a screenshot copied with Cmd+Ctrl+Shift+4 or Win+Shift+S. */
export function imageFrom(data: DataTransfer | null | undefined): File | null {
  if (!data) return null
  const file = [...(data.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (file) return file
  for (const item of [...(data.items ?? [])]) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

/** Reads an image through the async Clipboard API (the "Paste" button). Needs the browser's permission. */
export async function readClipboardImage(): Promise<File | null> {
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (type) { const blob = await item.getType(type); return new File([blob], 'pasted-screenshot.png', { type }) }
  }
  return null
}
