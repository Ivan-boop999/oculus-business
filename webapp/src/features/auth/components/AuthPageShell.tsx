import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { BrandMarkGlow } from '@/components/BrandMark'

/// Экран входа в фирменном стиле OCULUS: слева бренд-панель со «знаком-глазом»
/// и свечением (на ПК), справа — форма. На телефоне — знак над формой.
export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-svh bg-background lg:grid-cols-2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1000px 520px at 20% 0%, rgba(99,102,241,0.16), transparent 62%),' +
            'radial-gradient(800px 480px at 100% 100%, rgba(34,211,238,0.08), transparent 60%)',
        }}
      />

      {/* Форма */}
      <section className="relative z-10 flex flex-col p-6 md:p-10">
        <div className="flex justify-center gap-2 lg:hidden">
          <Link className="flex items-center gap-2.5" search={{ returnTo: undefined }} to="/login">
            <BrandMarkGlow className="h-10 w-15" />
            <span className="text-base font-semibold tracking-tight text-white">
              Окулус Бизнес
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-xs rounded-2xl border border-white/6 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur-sm">
            {children}
          </div>
        </div>
      </section>

      {/* Бренд-панель (только ПК) */}
      <section
        aria-hidden
        className="relative hidden overflow-hidden border-l border-white/6 bg-[#0A0D14] lg:block"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(620px 420px at 50% 34%, rgba(99,102,241,0.18), transparent 65%),' +
              'radial-gradient(480px 320px at 80% 90%, rgba(67,56,202,0.16), transparent 60%)',
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-12">
          <BrandMarkGlow className="h-56 w-84" />
          <div className="max-w-md text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Производство, которое видно в реальном времени
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Окулус Бизнес — командный центр ОРДИКС: сделки, деньги и развитие продукта
              в одной системе. Смена, задание, факт — и теперь весь бизнес целиком.
            </p>
          </div>
          <div className="flex items-center gap-6 text-[11px] tracking-[0.12em] text-muted-foreground/70 uppercase">
            <span>CRM · Сделки</span>
            <span className="h-1 w-1 rounded-full bg-[#6366F1] shadow-[0_0_8px_rgba(99,102,241,0.9)]" />
            <span>Финансы · Прогноз</span>
            <span className="h-1 w-1 rounded-full bg-[#6366F1] shadow-[0_0_8px_rgba(99,102,241,0.9)]" />
            <span>Доработки</span>
          </div>
        </div>
      </section>
    </main>
  )
}
