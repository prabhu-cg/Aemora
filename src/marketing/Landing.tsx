import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { Logo } from '../components/ui/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { buttonClass } from '../components/ui/buttonClass'
import { Frame } from '../components/ui/Frame'
import { AppWindow, DialogBody, MappingBody, XmlBody } from './windows'
import { Laptop } from './Laptop'

const go = (id: string) => {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

const NAV = [['how', 'How it works'], ['inputs', 'Ways in'], ['tour', 'Inside'], ['limits', 'Limits'], ['faq', 'FAQ']] as const

/** One word picked out the way a design tool selects it. Used once, in the headline. */
function PointerHighlight({ children }: { children: string }) {
  const handle = 'absolute size-2 border-2 border-accent/55 bg-surface'
  return (
    <span className="relative inline-block px-[0.14em] text-accent-text">
      <span aria-hidden="true" className="pointer-events-none absolute -inset-x-0.5 inset-y-[0.04em] rounded-md border-2 border-accent/55">
        <span className={`${handle} -left-1 -top-1`} /><span className={`${handle} -right-1 -top-1`} /><span className={`${handle} -bottom-1 -left-1`} /><span className={`${handle} -bottom-1 -right-1`} />
      </span>
      {children}
      <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute -bottom-3 -right-3 size-5 text-ink-strong"><path d="M3 2l13 7-6 1.5L7.5 17z" fill="currentColor" stroke="var(--bg)" strokeWidth="1.2" strokeLinejoin="round" /></svg>
    </span>
  )
}

function Section({ id, tone = 'white', children, label }: { id?: string; tone?: 'white' | 'sand'; children: React.ReactNode; label: string }) {
  return (
    <section id={id} aria-label={label} className={tone === 'sand' ? 'border-y border-hairline bg-sand' : ''}>
      <Frame className="py-20 sm:py-28">{children}</Frame>
    </section>
  )
}

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="max-w-[22ch] text-[clamp(1.875rem,3.6vw,2.625rem)] leading-[1.1] tracking-[-0.03em]">{children}</h2>
const Lede = ({ children }: { children: React.ReactNode }) => <p className="mt-4 max-w-[56ch] text-[1.125rem] leading-relaxed text-ink-muted">{children}</p>

const STEPS = [
  ['Bring in a design', 'Paste or upload component JSON, paste a description, read a Figma file, or annotate a screenshot by hand. Every route ends in the same component model.'],
  ['Review the properties', 'Rename them, set types, required flags, defaults and allowed values. Anything Aemora cannot map is kept and flagged, never dropped.'],
  ['Map each one to an AEM field', 'Each property gets a suggested Granite UI field. Fourteen field types are available, and every suggestion can be changed.'],
  ['Arrange the dialog', 'Group fields into tabs and sections, drag them into order, and decide which properties stay out of the dialog.'],
  ['Preview it, then take the XML', 'Try the dialog in a simulated authoring preview, then copy or download complete dialog XML, checked three ways.'],
]

const INPUTS: [string, string, 'live' | 'planned'][] = [
  ['Component JSON', 'A documented format with a JSON Schema. Mistakes come back with the exact path that is wrong.', 'live'],
  ['Clipboard', 'Paste JSON or a plain text description. Lines Aemora cannot read are listed for you to correct, not discarded.', 'live'],
  ['Figma API', 'Reads component names, variants, properties, text layers and sizes. Your token stays in memory for the session.', 'live'],
  ['Screenshot', 'Mark regions on an image and describe each property yourself. Nothing is guessed from pixels.', 'live'],
  ['Figma plugin', 'A companion plugin that sends components straight in. The format is defined; the plugin is not built yet.', 'planned'],
]

const LIMITS: [string, string][] = [
  ['The preview is a simulation', 'It shows how the dialog is laid out and how required fields and limits behave. It is not a running AEM instance, and AEM will look and behave a little differently.'],
  ['The XML has not run on AEM yet', 'It follows Granite UI and Coral conventions and passes structural checks, but it has not been tested on a live Cloud Service environment. Try it on a development instance before you rely on it.'],
  ['No AI in the loop', 'The same input always produces the same XML. Mappings come from fixed rules you can read and override.'],
  ['Your work stays in your browser', 'There is no server and no account. Projects are stored locally. A Figma token is held in memory, and is never saved, exported or logged.'],
]

const FAQ: [string, string][] = [
  ['Do I need Figma?', 'No. JSON, clipboard text and screenshots all work without it. Figma is one way in, not a requirement.'],
  ['Does my design leave the browser?', 'Only if you ask for it: reading a Figma file sends a request to Figma with your token. Everything else happens on your machine.'],
  ['Which AEM is this for?', 'AEM as a Cloud Service, Touch UI dialogs built from Granite UI and Coral components. It does not generate Classic UI dialogs or custom widgets. The one script it ever adds is a small show/hide clientlib, included in the export only when a dialog uses “show only when” fields.'],
  ['Can I change the XML by hand?', 'Yes. Switch to edit mode, format it, and watch the checks update. If you change the design afterwards, Aemora tells you your edited XML is out of date instead of overwriting it.'],
  ['How do I try it without setting anything up?', 'Open the sample project. It is read-only, with five components already mapped, laid out and turned into XML, and you can make an editable copy of it.'],
]

export function Landing() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="min-h-dvh bg-bg text-base">
      <header className="sticky top-0 z-30 border-b border-hairline bg-bg/92 backdrop-blur">
        <Frame className="flex h-16 items-center justify-between gap-4">
          <Logo tagline />
          <nav aria-label="Page sections" className="hidden items-center gap-6 md:flex">
            {NAV.map(([id, label]) => <button key={id} type="button" onClick={() => go(id)} className="cursor-pointer text-[15px] font-semibold text-ink/80 hover:text-ink-strong">{label}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/app/sample" className="hidden h-10 items-center rounded-lg px-3 text-[15px] font-semibold text-ink hover:bg-sand sm:inline-flex">Sample project</Link>
            <Link to="/app" className={buttonClass('primary', 'md')}>Open the tool</Link>
          </div>
        </Frame>
      </header>

      <main>
        <section aria-label="Introduction" className="relative overflow-hidden">
          <div aria-hidden="true" className="hero-aura absolute inset-0" />
          <Frame className="relative pb-20 pt-16 sm:pb-28 sm:pt-24">
            <div className="rise mx-auto max-w-4xl text-center">
              <h1 className="text-[clamp(2.5rem,6.2vw,4.75rem)] leading-[1.04] tracking-[-0.04em]">
                Design properties in. AEM <PointerHighlight>dialog XML</PointerHighlight> out.
              </h1>
              <p className="mx-auto mt-6 max-w-[58ch] text-[1.1875rem] leading-relaxed text-ink-muted">
                Aemora turns a design component’s properties into a complete AEM Cloud Service dialog: mapped to Granite UI fields, arranged in tabs, previewed, and written out as XML. Deterministic, in your browser, with no AI and no backend.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                <Link to="/app" className={`${buttonClass('primary', 'lg')} rounded-full`}>Open the tool<ArrowRight size={18} aria-hidden="true" /></Link>
                <Link to="/app/sample" className="text-[15px] font-semibold text-ink-muted underline-offset-4 hover:text-ink-strong hover:underline">See the sample project</Link>
              </div>
            </div>
            <div className="rise-late mx-auto mt-16 max-w-[1040px]">
              <Laptop
                alt="Aemora open on the AEM fields tab of the Card component from the sample project: each design property, such as Heading, Description and Image, next to the Granite UI field it maps to, like Textfield, Textarea and Pathfield."
                caption="Aemora with the Card component from the built-in sample project: every design property next to the Granite UI field it maps to."
              />
            </div>
          </Frame>
        </section>

        <Section id="how" tone="sand" label="How it works">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5 lg:sticky lg:top-28 lg:self-start">
              <H2>From a component’s properties to a dialog you can use.</H2>
              <Lede>Five steps, in one workspace. You can stop after any of them and pick it up later: everything is saved as you go.</Lede>
            </div>
            <ol className="lg:col-span-7">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="grid grid-cols-[1.75rem_1fr] gap-x-5">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-sand text-[12px] font-extrabold text-accent-text tabular" aria-hidden="true">{i + 1}</span>
                    {i < STEPS.length - 1 && <span aria-hidden="true" className="w-0.5 flex-1 bg-accent/40" />}
                  </div>
                  <div className="pb-10">
                    <h3 className="text-[1.375rem] leading-snug tracking-[-0.025em]">{title}</h3>
                    <p className="mt-1.5 max-w-[52ch] text-ink-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        <Section id="inputs" label="Ways in">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <H2>Start from whatever you already have.</H2>
              <Lede>Design files, copied notes, a screenshot. All of them become the same component model, so nothing downstream cares where it came from.</Lede>
            </div>
            <ul className="lg:col-span-7">
              {INPUTS.map(([name, text, status]) => (
                <li key={name} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-hairline-strong py-5 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1 basis-72">
                    <h3 className="text-[1.25rem] tracking-[-0.025em]">{name}</h3>
                    <p className="mt-1 max-w-[54ch] text-ink-muted">{text}</p>
                  </div>
                  {status === 'planned' && <span className="rounded-full border border-accent px-2.5 py-0.5 text-[12px] font-semibold text-accent-text">In development</span>}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="tour" tone="sand" label="Inside the tool">
          <H2>What you get when you open it.</H2>
          <div className="mt-16 space-y-24 sm:space-y-32">
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
              <div className="lg:col-span-5">
                <h3 className="text-[clamp(1.5rem,3vw,2rem)] leading-tight tracking-[-0.03em]">Every property gets a Granite field.</h3>
                <p className="mt-3 text-ink-muted">A fixed table of rules suggests the field: text becomes a textarea, a list of options becomes a select, a repeated link becomes a multifield. Disagree, and you change it. Each field shows the exact Granite resource type it will use.</p>
              </div>
              <AppWindow className="lg:col-span-7" title="Card · AEM fields" caption="Suggested field types for the Card sample. “Edited” marks one a person changed."><MappingBody rows={5} /></AppWindow>
            </div>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
              <AppWindow className="order-2 lg:order-1 lg:col-span-7" title="Card · Dialog" caption="Tabs, a section, and the settings for the selected field. Fields move by dragging or with the keyboard."><DialogBody /></AppWindow>
              <div className="order-1 lg:order-2 lg:col-span-5">
                <h3 className="text-[clamp(1.5rem,3vw,2rem)] leading-tight tracking-[-0.03em]">Arrange the dialog for the people who author with it.</h3>
                <p className="mt-3 text-ink-muted">Build tabs and sections, reorder fields, and leave properties out without deleting them. Open the preview at any point to see the dialog as an author would, over a mock page.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
              <div className="lg:col-span-5">
                <h3 className="text-[clamp(1.5rem,3vw,2rem)] leading-tight tracking-[-0.03em]">Complete XML, checked three separate ways.</h3>
                <p className="mt-3 text-ink-muted">You get a whole <code className="rounded bg-bg px-1 text-[0.9em]">_cq_dialog/.content.xml</code>, not fragments to assemble. Syntax, Aemora’s own model, and Granite UI structure are checked separately so you know which one is complaining. Edit it, format it, copy it, download it.</p>
              </div>
              <AppWindow className="lg:col-span-7" title="Card · XML" caption="The start of the generated XML for the Card sample, with its three checks."><XmlBody /></AppWindow>
            </div>
          </div>
        </Section>

        <Section id="limits" label="Limits">
          <H2>Plain about what it does not do.</H2>
          <ul className="mt-12 grid grid-cols-1 gap-x-16 md:grid-cols-2">
            {LIMITS.map(([title, text]) => (
              <li key={title} className="border-t border-hairline-strong py-6">
                <h3 className="text-[1.25rem] tracking-[-0.025em]">{title}</h3>
                <p className="mt-1.5 max-w-[52ch] text-ink-muted">{text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="faq" tone="sand" label="Frequently asked questions">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4"><H2>Questions.</H2></div>
            <div className="lg:col-span-8">
              {FAQ.map(([q, a], i) => (
                <details key={q} open={open === i} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setOpen(i); else if (open === i) setOpen(null) }} className="group border-t border-hairline-strong first:border-t-0 last:border-b last:border-hairline-strong">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[1.125rem] font-bold text-ink-strong [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-hairline-strong bg-bg transition-transform duration-200 group-open:rotate-45"><Plus size={16} /></span>
                  </summary>
                  <p className="max-w-[62ch] pb-5 text-ink-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>

        <section aria-label="Get started" className="bg-accent text-on-accent">
          <Frame className="py-20 text-center sm:py-24">
            <h2 className="mx-auto max-w-[20ch] text-[clamp(2rem,4.6vw,3.25rem)] leading-[1.05] tracking-[-0.03em] !text-on-accent">Try it on a real component.</h2>
            <p className="mx-auto mt-4 max-w-[48ch] text-[1.125rem] text-on-accent">Paste a component’s properties and have a dialog to review in a few minutes. Nothing to install or sign up for.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/app" className="inline-flex h-11 items-center rounded-lg bg-white px-6 text-sm font-bold text-accent-hover hover:bg-white/90 focus-visible:!outline-white">Open the tool</Link>
              <Link to="/app/sample" className="inline-flex h-11 items-center rounded-lg border border-white/70 px-6 text-sm font-bold text-on-accent hover:bg-white/10 focus-visible:!outline-white">Open the sample project</Link>
            </div>
          </Frame>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <Frame className="flex flex-wrap items-start justify-between gap-8 py-12">
          <div><Logo tagline /><p className="mt-3 max-w-[34ch] text-[14px] text-ink-muted">Turns design component properties into AEM Cloud Service dialog XML.</p></div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-[15px]">
            <Link to="/app" className="text-ink-muted hover:text-ink-strong hover:underline">Open the tool</Link>
            <a href="./schemas/aemora-components-v1.json" className="text-ink-muted hover:text-ink-strong hover:underline">Component JSON schema</a>
            <Link to="/app/sample" className="text-ink-muted hover:text-ink-strong hover:underline">Sample project</Link>
            <a href="https://github.com/prabhu-cg/Aemora" className="text-ink-muted hover:text-ink-strong hover:underline">Source on GitHub</a>
          </nav>
        </Frame>
        <p className="border-t border-hairline py-5 text-center text-[14px] text-ink-muted">Aemora. Generate. Build. Scale.</p>
      </footer>
    </div>
  )
}
