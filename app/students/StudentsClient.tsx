'use client'
import { useState, useMemo } from 'react'
import { C } from '@/lib/constants'

type StudentRow = {
  student: { id: string; zh_name: string; en_name: string | null; status: string }
  account: { course_label: string; total_lessons?: number; is_trial?: boolean } | null
  isActive: boolean
}

export function StudentsClient({
  activeStudents,
  allStudents,
}: {
  activeStudents: StudentRow[]
  allStudents: StudentRow[]
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'active' | 'all'>('active')

  const source = filter === 'active' ? activeStudents : allStudents

  const filtered = useMemo(() => {
    if (!search) return source
    const q = search.toLowerCase()
    return source.filter(({ student: s }) =>
      s.zh_name.toLowerCase().includes(q) || s.en_name?.toLowerCase().includes(q)
    )
  }, [source, search])

  const statusColor: Record<string, { bg: string; color: string }> = {
    Active: { bg: '#E8F5E9', color: '#2E7D32' },
    Trial: { bg: '#FFF8E1', color: '#F57F17' },
    Paused: { bg: '#FFF8E1', color: '#F57F17' },
    Closed: { bg: '#F5F5F5', color: '#9E9E9E' },
    Completed: { bg: '#E3F2FD', color: '#1565C0' },
  }

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-serif text-[24px] sm:text-[28px] font-medium" style={{ color: C.navy }}>
          My Students
        </h1>
        <span className="text-sm" style={{ color: C.muted }}>{filtered.length} students</span>
      </div>

      {/* 篩選列 */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="Search by name..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="rounded-xl border px-4 py-2 text-sm outline-none flex-1 min-w-[180px]"
          style={{ borderColor: C.line, color: C.navy }} />
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EAF0F6' }}>
          {(['active', 'all'] as const).map(v => (
            <button key={v} onClick={() => setFilter(v)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition"
              style={{
                background: filter === v ? C.navy : 'transparent',
                color: filter === v ? '#fff' : C.muted,
              }}>
              {v === 'active' ? `Active (${activeStudents.length})` : `All (${allStudents.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* 學生列表 */}
      <div className="flex flex-col gap-3">
        {filtered.map(({ student: s, account: a, isActive }) => {
          const sc = statusColor[s.status] ?? { bg: '#F5F5F5', color: '#9E9E9E' }
          return (
            <div key={s.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 sm:p-5 shadow-sm">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: isActive ? C.navy : C.muted }}>
                {s.en_name?.[0] ?? s.zh_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px]" style={{ color: C.navy }}>
                  {s.en_name ?? s.zh_name}
                  {s.en_name && (
                    <span className="ml-2 text-sm font-normal" style={{ color: C.muted }}>({s.zh_name})</span>
                  )}
                </div>
                {a?.is_trial && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded mt-0.5 inline-block"
                    style={{ background: '#FFF8E1', color: '#F57F17' }}>Trial</span>
                )}
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
                style={{ background: sc.bg, color: sc.color }}>
                {s.status}
              </span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: C.muted }}>No students found.</div>
        )}
      </div>
    </main>
  )
}
