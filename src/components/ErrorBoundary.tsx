import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence: if something unexpected breaks while drawing a page, show a calm message with
 * a way forward instead of a blank screen. Saved projects are in the browser's storage, not in React,
 * so they are not affected.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged for whoever opens the console. Never includes project data, tokens or storage contents.
    console.error('Aemora hit an unexpected error:', error.message, info.componentStack?.split('\n').slice(0, 4).join('\n'))
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
        <div role="alert">
          <h1 className="text-[2rem] leading-tight">Something went wrong.</h1>
          <p className="mt-3 text-ink-muted">
            Aemora hit an unexpected error and stopped drawing this page. Your projects are stored in this browser and have not been changed.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => location.reload()} className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent-hover">Reload the page</button>
          <a href="#/app" onClick={() => setTimeout(() => location.reload(), 0)} className="inline-flex h-10 items-center rounded-lg border border-hairline-strong bg-surface px-4 text-sm font-bold text-ink-strong hover:bg-sand">Go to your projects</a>
        </div>
        <details className="mt-8 text-[13px] text-ink-muted">
          <summary className="cursor-pointer font-bold text-ink-strong">What happened</summary>
          <p className="mt-2 break-words font-mono">{this.state.error.message || 'Unknown error'}</p>
          <p className="mt-2">If this keeps happening, download a backup from Settings once the app loads, then report it with the message above.</p>
        </details>
      </main>
    )
  }
}
