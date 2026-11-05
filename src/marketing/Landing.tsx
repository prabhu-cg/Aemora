import { Link } from 'react-router-dom'
import { Logo } from '../components/ui/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { buttonClass } from '../components/ui/buttonClass'

/* Holding page. The full marketing landing page ships in chunk 9. */
export function Landing() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex h-16 items-center justify-between border-b border-hairline px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.05] tracking-[-0.04em]">
          Design properties in. AEM dialog XML out.
        </h1>
        <p className="mx-auto mt-5 max-w-[56ch] text-lg text-ink-muted">
          Aemora maps component properties to Granite UI fields and generates a complete Cloud Service dialog, in your browser, with no AI and no backend.
        </p>
        <Link to="/app" className={`${buttonClass('primary', 'lg')} mt-8 rounded-full`}>Open the tool</Link>
      </main>
    </div>
  )
}
