import type { ReactNode } from 'react'
import appLight from './assets/app-light.webp'
import appDark from './assets/app-dark.webp'

/**
 * A laptop with a real screenshot of the running app on its screen (the Card component's AEM dialog
 * preview, from the built-in sample). Two captures, light and dark, so it follows the page theme.
 */
export function Laptop({ alt, caption, children }: { alt: string; caption: ReactNode; children?: ReactNode }) {
  return (
    <figure className="min-w-0">
      <div className="mx-auto w-full max-w-[1000px]">
        {/* Lid: aluminium edge, black bezel, camera, then the screen itself. */}
        <div className="rounded-[22px] bg-gradient-to-b from-[#d9d9dc] to-[#b9b9be] p-[3px] shadow-[0_30px_60px_-24px_#1010148c,0_8px_16px_-8px_#10101440]">
          <div className="relative rounded-[19px] bg-[#0b0b0c] px-[2.2%] pb-[2.2%] pt-[3.4%]">
            <span aria-hidden="true" className="absolute left-1/2 top-[1.3%] size-[0.6%] min-h-1 min-w-1 -translate-x-1/2 rounded-full bg-[#2a2a30] ring-1 ring-[#3a3a42]" />
            <div className="relative aspect-[8/5] overflow-hidden rounded-[6px] bg-surface">
              <img src={appLight} alt={alt} width={1120} height={700} className="shot-light absolute inset-0 size-full object-cover object-top" decoding="async" />
              <img src={appDark} alt="" aria-hidden="true" width={1120} height={700} className="shot-dark absolute inset-0 size-full object-cover object-top" decoding="async" />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
            </div>
          </div>
        </div>
        {/* Base: slightly wider than the lid, with the thumb notch. */}
        <div aria-hidden="true" className="relative mx-auto -mt-px h-[14px] w-[112%] max-w-none -translate-x-[5.35%] rounded-b-[18px] rounded-t-[3px] bg-gradient-to-b from-[#c9c9ce] via-[#dcdce0] to-[#a9a9af] shadow-[0_18px_28px_-12px_#10101466]">
          <span className="absolute left-1/2 top-0 h-[6px] w-[14%] -translate-x-1/2 rounded-b-[10px] bg-gradient-to-b from-[#9a9aa0] to-[#bdbdc2]" />
        </div>
      </div>
      {children}
      <figcaption className="mt-6 text-center text-[14px] text-ink-muted">{caption}</figcaption>
    </figure>
  )
}
