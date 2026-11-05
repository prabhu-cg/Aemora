import { Link } from 'react-router-dom'
import { Logo } from '../components/ui/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { buttonClass } from '../components/ui/buttonClass'
import { Frame } from '../components/ui/Frame'

/* Holding page. The full marketing landing page ships in chunk 9. */
export function Landing() {
  return (
    <div className="min-h-dvh bg-bg text-base">
      <header className="border-b border-hairline">
        <Frame className="flex h-16 items-center justify-between">
          <Logo tagline />
          <ThemeToggle />
        </Frame>
      </header>
      <Frame as="main" className="py-20 text-center sm:py-28">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.05] tracking-[-0.04em]">
            Design properties in. AEM dialog XML out.
          </h1>
          <p className="mx-auto mt-5 max-w-[56ch] text-lg text-ink-muted">
            Aemora maps component properties to Granite UI fields and generates a complete Cloud Service dialog, in your browser, with no AI and no backend.
          </p>
          <Link to="/app" className={`${buttonClass('primary', 'lg')} mt-8 rounded-full`}>Open the tool</Link>
        </div>
      </Frame>
    </div>
  )
}
