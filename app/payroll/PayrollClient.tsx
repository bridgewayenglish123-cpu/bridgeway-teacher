"use client"
import { useState, useMemo } from 'react'
import { C } from '@/lib/constants'

type Lesson = {
  id: string
  date: string
  time: string | null
  duration: number | null
  status: string
  class_type: string
  payout_snapshot: any
  student: { en_name: string | null; zh_name: string } | null
  report: { id: string; created_at: string }[] | null
}

type Period = {
  period_key: string
  paid: boolean
  paid_date: string | null
}

type Extra = {
  id: string
  period_key: string
  amount_php: number
  amount_ntd: number
  note: string | null
  date: string
}

type Teacher = {
  id: string
  teacher_name: string
  teacher_type: string
}

function periodOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (day >= 10 && day <= 24) {
    return `${y}-${String(m).padStart(2, '0')}-10`
  } else if (day >= 25) {
    return `${y}-${String(m).padStart(2, '0')}-25`
  } else {
    const pm = m === 1 ? 12 : m - 1
    const py = m === 1 ? y - 1 : y
    return `${py}-${String(pm).padStart(2, '0')}-25`
  }
}

function periodLabel(key: string): string {
  const [y, m, d] = key.split('-')
  const day = parseInt(d)
  if (day === 10) {
    const end = new Date(parseInt(y), parseInt(m) - 1, 24)
    return `${y}/${m}/10 – ${y}/${m}/24`
  } else {
    const startM = parseInt(m)
    const endM = startM === 12 ? 1 : startM + 1
    const endY = startM === 12 ? parseInt(y) + 1 : parseInt(y)
    return `${y}/${String(startM).padStart(2,'0')}/25 – ${endY}/${String(endM).padStart(2,'0')}/09`
  }
}

function classifyLesson(l: Lesson): 'trial' | 's25' | 'l55' {
  if (l.class_type === 'trial' || l.duration === 25 && l.payout_snapshot?.original_price_ntd <= 250) return 'trial'
  if (l.duration && l.duration <= 30) return 's25'
  return 'l55'
}

function lessonPayoutPhp(l: Lesson, phpRate: number): number {
  const snap = l.payout_snapshot ?? {}
  if (snap.teacher_payout_currency === 'PHP' && snap.teacher_payout_php) {
    return snap.teacher_payout_php
  }
  return Math.round((snap.teacher_payout_ntd ?? 0) * phpRate * 100) / 100
}

export function PayrollClient({ teacher, lessons, periods, extras, phpRate }: {
  teacher: Teacher
  lessons: Lesson[]
  periods: Period[]
  extras: Extra[]
  phpRate: number
}) {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)

  // 所有期別（含無對應 period record 的）
  const allPeriodKeys = useMemo(() => {
    const keys = new Set<string>()
    lessons.forEach(l => keys.add(periodOf(l.date)))
    periods.forEach(p => keys.add(p.period_key))
    return Array.from(keys).sort((a, b) => b.localeCompare(a))
  }, [lessons, periods])

  const curPeriodKey = allPeriodKeys[0] ?? periodOf(new Date().toISOString().slice(0, 10))
  const activePeriod = selectedPeriod ?? curPeriodKey

  // 篩出這期的課程
  const periodLessons = useMemo(() =>
    lessons.filter(l => periodOf(l.date) === activePeriod),
    [lessons, activePeriod]
  )

  const periodRecord = periods.find(p => p.period_key === activePeriod)
  const periodExtras = extras.filter(e => e.period_key === activePeriod)

  // 統計
  const stats = useMemo(() => {
    let trial = 0, s25 = 0, l55 = 0
    let payablePhp = 0, pendingCount = 0
    periodLessons.forEach(l => {
      const cat = classifyLesson(l)
      if (cat === 'trial') trial++
      else if (cat === 's25') s25++
      else l55++

      const hasReport = Array.isArray(l.report) ? l.report.length > 0 : !!l.report
      if (hasReport) {
        payablePhp += lessonPayoutPhp(l, phpRate)
      } else {
        pendingCount++
      }
    })
    const extraPhp = periodExtras.reduce((s, e) => s + e.amount_php, 0)
    return { trial, s25, l55, total: trial + s25 + l55, payablePhp, pendingCount, extraPhp }
  }, [periodLessons, periodExtras, phpRate])

  const isPaid = periodRecord?.paid ?? false

  return (
    <main className="mx-auto max-w-[860px] px-4 py-6 sm:px-8 sm:py-8 pb-24 sm:pb-8"
      style={{ background: '#F7F4EE', minHeight: '100dvh' }}>

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-[28px] sm:text-[32px] font-medium" style={{ color: C.navy }}>
          Payroll
        </h1>
        <p className="text-[13px] mt-1" style={{ color: C.muted }}>
          {teacher.teacher_name} · 1 NTD = {phpRate} PHP
        </p>
      </div>

      {/* 期別選擇 */}
      <div className="flex gap-2 flex-wrap mb-5">
        {allPeriodKeys.slice(0, 6).map(key => (
          <button key={key} onClick={() => setSelectedPeriod(key)}
            className="rounded-xl px-3 py-1.5 text-[12px] font-medium border transition"
            style={{
              background: activePeriod === key ? C.navy : '#fff',
              color: activePeriod === key ? '#fff' : C.muted,
              borderColor: activePeriod === key ? C.navy : C.line,
            }}>
            {periodLabel(key)}
          </button>
        ))}
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Trial', value: stats.trial, color: C.muted },
          { label: '25 min', value: stats.s25, color: C.navy },
          { label: '55 min', value: stats.l55, color: C.navy },
          { label: 'Total', value: stats.total, color: C.gold },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <div className="font-serif text-[28px] font-medium" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 薪資摘要 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[13px] font-semibold" style={{ color: C.navy }}>Estimated Payroll</div>
          {isPaid ? (
            <span className="text-[12px] px-3 py-1 rounded-full font-medium"
              style={{ background: '#E8F5E9', color: '#2E7D32' }}>
              ✓ Paid {periodRecord?.paid_date ?? ''}
            </span>
          ) : (
            <span className="text-[12px] px-3 py-1 rounded-full font-medium"
              style={{ background: '#FEF3C7', color: '#92400E' }}>
              Pending
            </span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-[13px]">
            <span style={{ color: C.muted }}>Completed lessons ({stats.total - stats.pendingCount} lessons)</span>
            <span className="font-semibold" style={{ color: C.navy }}>PHP {stats.payablePhp.toFixed(0)}</span>
          </div>
          {stats.pendingCount > 0 && (
            <div className="flex justify-between text-[13px]">
              <span style={{ color: C.muted }}>Pending (no report) ({stats.pendingCount} lessons)</span>
              <span className="font-medium" style={{ color: '#92400E' }}>Not counted</span>
            </div>
          )}
          {stats.extraPhp > 0 && (
            <div className="flex justify-between text-[13px]">
              <span style={{ color: C.muted }}>Extras / Bonus</span>
              <span className="font-semibold" style={{ color: C.navy }}>PHP {stats.extraPhp.toFixed(0)}</span>
            </div>
          )}
          <div className="flex justify-between text-[15px] font-bold pt-2"
            style={{ borderTop: `1px solid ${C.line}`, color: C.gold }}>
            <span>Total</span>
            <span>PHP {(stats.payablePhp + stats.extraPhp).toFixed(0)}</span>
          </div>
        </div>
        {stats.pendingCount > 0 && (
          <div className="mt-3 rounded-xl px-3 py-2 text-[12px]"
            style={{ background: '#FEF3C7', color: '#92400E' }}>
            ⚠ {stats.pendingCount} lesson{stats.pendingCount > 1 ? 's' : ''} without a report will not be counted until the report is submitted.
          </div>
        )}
      </div>

      {/* 課程明細 */}
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b" style={{ borderColor: C.line }}>
          <div className="text-[13px] font-semibold" style={{ color: C.navy }}>Lesson Details</div>
        </div>
        <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as any}>
          {periodLessons.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: C.muted }}>
              No lessons in this period.
            </div>
          ) : periodLessons.map(l => {
            const hasReport = Array.isArray(l.report) ? l.report.length > 0 : !!l.report
            const studentName = (l.student as any)?.en_name ?? (l.student as any)?.zh_name ?? '—'
            const cat = classifyLesson(l)
            const php = lessonPayoutPhp(l, phpRate)
            const catLabel = cat === 'trial' ? 'Trial' : cat === 's25' ? '25 min' : '55 min'

            return (
              <div key={l.id} className="px-5 py-3 flex items-center gap-3"
                style={{ borderColor: C.line }}>
                <div className="flex-shrink-0 text-center w-10">
                  <div className="text-[10px] uppercase" style={{ color: C.muted }}>{l.date.slice(5, 7)}月</div>
                  <div className="font-serif text-[20px] font-medium leading-none" style={{ color: C.navy }}>{l.date.slice(8)}</div>
                </div>
                <div className="w-px self-stretch" style={{ background: C.line }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14px] truncate" style={{ color: C.navy }}>{studentName}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>
                    {l.time ? l.time.slice(0, 5) : ''} · {catLabel}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {hasReport ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: '#E8F5E9', color: '#2E7D32' }}>✓ Report</span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: '#FEF3C7', color: '#92400E' }}>No report</span>
                  )}
                  <div className="text-right">
                    <div className="text-[13px] font-semibold" style={{ color: hasReport ? C.navy : C.muted }}>
                      {hasReport ? `PHP ${php.toFixed(0)}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 額外費用 */}
      {periodExtras.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b" style={{ borderColor: C.line }}>
            <div className="text-[13px] font-semibold" style={{ color: C.navy }}>Extras / Bonus</div>
          </div>
          {periodExtras.map(e => (
            <div key={e.id} className="px-5 py-3 flex items-center justify-between border-b last:border-0"
              style={{ borderColor: C.line }}>
              <div>
                <div className="text-[13px]" style={{ color: C.navy }}>{e.note ?? 'Bonus'}</div>
                <div className="text-[11px]" style={{ color: C.muted }}>{e.date}</div>
              </div>
              <div className="text-[13px] font-semibold" style={{ color: C.gold }}>PHP {e.amount_php}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
