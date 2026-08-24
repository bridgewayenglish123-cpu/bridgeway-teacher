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

type Filter = 'all' | 'no-report' | 'paid'
type Sort = 'newest' | 'oldest'

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
  const mNum = parseInt(m)
  if (day === 10) {
    return `${y}/${m}/10 – ${y}/${m}/24`
  } else {
    const endM = mNum === 12 ? 1 : mNum + 1
    const endY = mNum === 12 ? parseInt(y) + 1 : parseInt(y)
    return `${y}/${m}/25 – ${endY}/${String(endM).padStart(2,'0')}/09`
  }
}

function classifyLesson(l: Lesson): 'trial' | 's25' | 'l55' {
  if (l.class_type === 'trial') return 'trial'
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

function hasReport(l: Lesson): boolean {
  return Array.isArray(l.report) ? l.report.length > 0 : !!l.report
}

export function PayrollClient({ teacher, lessons, periods, extras, phpRate }: {
  teacher: Teacher
  lessons: Lesson[]
  periods: Period[]
  extras: Extra[]
  phpRate: number
}) {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [search, setSearch] = useState('')

  const allPeriodKeys = useMemo(() => {
    const keys = new Set<string>()
    lessons.forEach(l => keys.add(periodOf(l.date)))
    periods.forEach(p => keys.add(p.period_key))
    return Array.from(keys).sort((a, b) => b.localeCompare(a))
  }, [lessons, periods])

  const curPeriodKey = allPeriodKeys[0] ?? periodOf(new Date().toISOString().slice(0, 10))
  const activePeriod = selectedPeriod ?? curPeriodKey
  const periodRecord = periods.find(p => p.period_key === activePeriod)
  const isPaid = periodRecord?.paid ?? false

  const periodLessons = useMemo(() =>
    lessons.filter(l => periodOf(l.date) === activePeriod),
    [lessons, activePeriod]
  )

  const periodExtras = extras.filter(e => e.period_key === activePeriod)

  // 統計
  const stats = useMemo(() => {
    let trial = 0, s25 = 0, l55 = 0, payablePhp = 0, pendingCount = 0
    periodLessons.forEach(l => {
      const cat = classifyLesson(l)
      if (cat === 'trial') trial++
      else if (cat === 's25') s25++
      else l55++
      if (hasReport(l)) payablePhp += lessonPayoutPhp(l, phpRate)
      else pendingCount++
    })
    const extraPhp = periodExtras.reduce((s, e) => s + e.amount_php, 0)
    return { trial, s25, l55, total: periodLessons.length, payablePhp, pendingCount, extraPhp }
  }, [periodLessons, periodExtras, phpRate])

  // 上期比較
  const prevPeriodKey = allPeriodKeys[1]
  const prevStats = useMemo(() => {
    if (!prevPeriodKey) return null
    const prev = lessons.filter(l => periodOf(l.date) === prevPeriodKey)
    return { total: prev.length }
  }, [lessons, prevPeriodKey])

  // 篩選 + 排序 + 搜尋
  const filtered = useMemo(() => {
    let list = [...periodLessons]
    if (filter === 'no-report') list = list.filter(l => !hasReport(l))
    if (filter === 'paid') list = list.filter(l => hasReport(l))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(l => {
        const name = ((l.student as any)?.en_name ?? (l.student as any)?.zh_name ?? '').toLowerCase()
        return name.includes(q) || l.date.includes(q)
      })
    }
    list.sort((a, b) => sort === 'newest'
      ? b.date.localeCompare(a.date)
      : a.date.localeCompare(b.date)
    )
    return list
  }, [periodLessons, filter, sort, search])

  const totalPhp = stats.payablePhp + stats.extraPhp

  return (
    <main className="mx-auto max-w-[860px] px-4 py-6 sm:px-8 sm:py-8 pb-24 sm:pb-8"
      style={{ background: '#F7F4EE', minHeight: '100dvh' }}>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-[28px] sm:text-[32px] font-medium" style={{ color: C.navy }}>
            Payroll
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: C.muted }}>
            {teacher.teacher_name} · Rate: 1 NTD = {phpRate} PHP
          </p>
        </div>
        {/* 期別下拉 */}
        <div className="flex flex-col items-end gap-1">
          <select
            value={activePeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="rounded-xl border px-3 py-2 text-[13px] outline-none font-medium"
            style={{ borderColor: C.line, color: C.navy, background: '#fff' }}>
            {allPeriodKeys.map(key => (
              <option key={key} value={key}>{periodLabel(key)}</option>
            ))}
          </select>
          {prevStats && (
            <div className="text-[11px]" style={{ color: C.muted }}>
              vs last period: {prevStats.total} lessons
            </div>
          )}
        </div>
      </div>

      {/* 薪資總額（最醒目） */}
      <div className="rounded-2xl p-5 sm:p-6 mb-5 shadow-sm"
        style={{ background: C.navy }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[13px] font-medium" style={{ color: 'rgba(247,244,238,0.6)' }}>
            {periodLabel(activePeriod)}
          </div>
          {isPaid ? (
            <span className="text-[12px] px-3 py-1 rounded-full font-medium"
              style={{ background: 'rgba(34,197,94,0.2)', color: '#4ADE80' }}>
              ✓ Paid {periodRecord?.paid_date ? `· ${periodRecord.paid_date}` : ''}
            </span>
          ) : (
            <span className="text-[12px] px-3 py-1 rounded-full font-medium"
              style={{ background: 'rgba(251,191,36,0.2)', color: '#FCD34D' }}>
              Pending
            </span>
          )}
        </div>
        <div className="flex items-end gap-3 mb-4">
          <div className="font-serif text-[48px] sm:text-[56px] font-bold leading-none" style={{ color: '#F7F4EE' }}>
            PHP {totalPhp.toFixed(0)}
          </div>
          {prevStats && stats.total !== prevStats.total && (
            <div className="text-[13px] pb-2" style={{ color: stats.total > prevStats.total ? '#4ADE80' : '#F87171' }}>
              {stats.total > prevStats.total ? '↑' : '↓'} {Math.abs(stats.total - prevStats.total)} vs last period
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Completed', value: `${stats.total - stats.pendingCount} lessons`, sub: `PHP ${stats.payablePhp.toFixed(0)}` },
            { label: 'Pending', value: `${stats.pendingCount} lessons`, sub: 'No report yet' },
            { label: 'Extras', value: `PHP ${stats.extraPhp.toFixed(0)}`, sub: `${periodExtras.length} item${periodExtras.length !== 1 ? 's' : ''}` },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(247,244,238,0.5)' }}>{s.label}</div>
              <div className="text-[14px] font-semibold" style={{ color: '#F7F4EE' }}>{s.value}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'rgba(247,244,238,0.4)' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Trial', value: stats.trial, icon: '◈', color: C.muted },
          { label: '25 min', value: stats.s25, icon: '◉', color: C.navy },
          { label: '55 min', value: stats.l55, icon: '◎', color: C.gold },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white p-4 shadow-sm flex items-center gap-3">
            <div className="text-[22px]" style={{ color: s.color }}>{s.icon}</div>
            <div>
              <div className="font-serif text-[24px] font-medium leading-none" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 課程明細 */}
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b" style={{ borderColor: C.line }}>
          <div className="text-[13px] font-semibold mb-3" style={{ color: C.navy }}>Lesson Details</div>

          {/* 搜尋 */}
          <input type="text" placeholder="Search student name or date..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-[13px] outline-none mb-2"
            style={{ borderColor: C.line, color: C.navy }} />

          {/* 篩選 + 排序 */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EDE9E0' }}>
              {([
                { v: 'all', l: `All (${stats.total})` },
                { v: 'paid', l: `Reported (${stats.total - stats.pendingCount})` },
                { v: 'no-report', l: `No Report (${stats.pendingCount})` },
              ] as const).map(f => (
                <button key={f.v} onClick={() => setFilter(f.v)}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition"
                  style={{ background: filter === f.v ? C.navy : 'transparent', color: filter === f.v ? '#fff' : C.muted }}>
                  {f.l}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EDE9E0' }}>
              {([{ v: 'newest', l: 'Newest' }, { v: 'oldest', l: 'Oldest' }] as const).map(s => (
                <button key={s.v} onClick={() => setSort(s.v)}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition"
                  style={{ background: sort === s.v ? C.navy : 'transparent', color: sort === s.v ? '#fff' : C.muted }}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>
          {(search || filter !== 'all') && (
            <div className="text-[11px] mt-2" style={{ color: C.muted }}>{filtered.length} results</div>
          )}
        </div>

        {/* 課程列表 */}
        <div className="divide-y" style={{ borderColor: C.line }}>
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: C.muted }}>
              No lessons found.
            </div>
          ) : filtered.map(l => {
            const reported = hasReport(l)
            const studentName = (l.student as any)?.en_name ?? (l.student as any)?.zh_name ?? '—'
            const cat = classifyLesson(l)
            const php = lessonPayoutPhp(l, phpRate)
            const catLabel = cat === 'trial' ? 'Trial' : cat === 's25' ? '25 min' : '55 min'
            const catColor = cat === 'trial' ? C.muted : cat === 's25' ? C.navy : C.gold

            return (
              <div key={l.id} className="px-5 py-4 flex items-center gap-3 sm:gap-4"
                style={{ borderColor: C.line, borderLeft: `3px solid ${reported ? C.green : '#FDE68A'}` }}>
                {/* 日期 */}
                <div className="flex-shrink-0 text-center w-9 sm:w-11">
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>
                    {new Date(l.date + 'T00:00:00').toLocaleString('en', { month: 'short' })}
                  </div>
                  <div className="font-serif text-[22px] sm:text-[26px] font-medium leading-none mt-0.5" style={{ color: C.navy }}>
                    {l.date.slice(8)}
                  </div>
                </div>
                <div className="w-px self-stretch" style={{ background: C.line }} />
                {/* 資訊 */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] sm:text-[15px] truncate" style={{ color: C.navy }}>
                    {studentName}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {l.time && <span className="text-[12px]" style={{ color: C.muted }}>{l.time.slice(0, 5)}</span>}
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: cat === 'l55' ? '#FBF8EF' : '#EEF2FF', color: catColor }}>
                      {catLabel}
                    </span>
                  </div>
                </div>
                {/* 狀態 + 薪資 */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <div className="text-[14px] font-bold" style={{ color: reported ? C.navy : C.muted }}>
                    {reported ? `PHP ${php.toFixed(0)}` : '—'}
                  </div>
                  {reported ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: '#E8F5E9', color: '#2E7D32' }}>✓ Report</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: '#FEF3C7', color: '#92400E' }}>No report</span>
                  )}
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
                <div className="text-[13px] font-medium" style={{ color: C.navy }}>{e.note ?? 'Bonus'}</div>
                <div className="text-[11px]" style={{ color: C.muted }}>{e.date}</div>
              </div>
              <div className="text-[14px] font-bold" style={{ color: C.gold }}>PHP {e.amount_php}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
