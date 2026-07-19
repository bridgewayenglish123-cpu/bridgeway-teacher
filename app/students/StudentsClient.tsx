'use client'
import { useState, useMemo } from 'react'
import { C } from '@/lib/constants'

type StudentRow = {
  student: { id: string; zh_name: string; en_name: string | null; status: string }
  account: { course_label: string; total_lessons: number; is_trial: boolean } | null
  latestDate: string
}

export function StudentsClient({ students }: { students: StudentRow[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Active' | 'all'>('Active')

  const filtered = useMemo(() => {
    return students.filter(({ student: s }) => {
      const matchStatus = statusFilter === 'all' || s.status === statusFilter
      const q = search.toLowerCase()
      const matchSearch = !q || s.zh_name.toLowerCase().includes(q) || s.en_name?.toLowerCase().includes(q)
      return matchStatus && matchSearch
    })
  }, [students, search, statusFilter])

  const statusLabel: Record<string, string> = {
    Active: 'Active', Paused: 'Paused', Closed: 'Closed', Completed: 'Completed',
  }

  const statusColor: Record<string, { bg: string; color: string }> = {
    Active: { bg: '#E8F5E9', color: '#2E7D4F' },
    Paused: { bg: '#FFF8E1', color: '#F57F17' },
    Closed: { bg: '#F5F5F5', color: '#9E9E9E' },
    Completed: { bg: '#E3F2FD', color: '#1565C0' },
  }

  return (
    <main className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-[28px] font-medium" style={{ color: C.navy }}>
          My Students
        </h1>
        <span className="text-sm" style={{ color: C.muted }}>{filtered.length} students</span>
      </div>

      {/* 篩選列 */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-xl border px-4 py-2 text-sm outline-none flex-1 min-w-[200px]"
          style={{ borderColor: C.line, color: C.navy }}
        />
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EAF0F6' }}>
          {(['Active', 'all'] as const).map(v => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition"
              style={{
                background: statusFilter === v ? C.navy : 'transparent',
                color: statusFilter === v ? '#fff' : C.muted,
              }}>
              {v === 'Active' ? 'Active' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* 學生列表 */}
      <div className="flex flex-col gap-3">
        {filtered.map(({ student: s, account: a }) => {
          const sc = statusColor[s.status] ?? { bg: '#F5F5F5', color: '#9E9E9E' }
          return (
            <div key={s.id} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
              {/* 頭像 */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: C.navy }}>
                {s.en_name?.[0] ?? s.zh_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px]" style={{ color: C.navy }}>
                  {s.en_name ?? s.zh_name}
                  <span className="ml-2 text-sm font-normal" style={{ color: C.muted }}>({s.zh_name})</span>
                </div>
                {a?.is_trial && (
                  <div className="mt-0.5">
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#FFF8E1', color: '#F57F17' }}>Trial</span>
                  </div>
                )}
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
                style={{ background: sc.bg, color: sc.color }}>
                {statusLabel[s.status] ?? s.status}
              </span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: C.muted }}>
            No students found.
          </div>
        )}
      </div>
    </main>
  )
}
