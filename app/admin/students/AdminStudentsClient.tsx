'use client'
import { useState, useMemo } from 'react'
import { C } from '@/lib/constants'

type Student = {
  id: string
  zh_name: string
  en_name: string | null
  status: string
  zoom_email: string | null
  auth_user_id: string | null
}

export function AdminStudentsClient({ students }: { students: Student[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'Active' | 'all'>('Active')

  const filtered = useMemo(() => {
    return students.filter(s => {
      const q = search.toLowerCase()
      const matchSearch = !q || s.zh_name.toLowerCase().includes(q) || s.en_name?.toLowerCase().includes(q) || s.zoom_email?.toLowerCase().includes(q)
      const matchFilter = filter === 'all' || s.status === filter || (filter === 'Active' && s.status === 'Trial')
      return matchSearch && matchFilter
    })
  }, [students, search, filter])

  const statusColor: Record<string, { bg: string; color: string }> = {
    Active: { bg: '#E8F5E9', color: '#2E7D32' },
    Trial: { bg: '#FFF8E1', color: '#F57F17' },
    Paused: { bg: '#FFF8E1', color: '#F57F17' },
    Closed: { bg: '#F5F5F5', color: '#9E9E9E' },
    Completed: { bg: '#E3F2FD', color: '#1565C0' },
  }

  const activeCount = students.filter(s => s.status === 'Active' || s.status === 'Trial').length

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-serif text-[28px] font-medium" style={{ color: C.navy }}>All Students</h1>
        <span className="text-sm" style={{ color: C.muted }}>{filtered.length} students</span>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="Search by name or email..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="rounded-xl border px-4 py-2 text-sm outline-none flex-1 min-w-[180px]"
          style={{ borderColor: C.line, color: C.navy }} />
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EAF0F6' }}>
          {(['Active', 'all'] as const).map(v => (
            <button key={v} onClick={() => setFilter(v)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition"
              style={{ background: filter === v ? C.navy : 'transparent', color: filter === v ? '#fff' : C.muted }}>
              {v === 'Active' ? `Active (${activeCount})` : `All (${students.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map(s => {
          const sc = statusColor[s.status] ?? { bg: '#F5F5F5', color: '#9E9E9E' }
          return (
            <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm flex items-center gap-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: C.navy }}>
                {s.en_name?.[0] ?? s.zh_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px]" style={{ color: C.navy }}>
                  {s.en_name ?? s.zh_name}
                  {s.en_name && <span className="ml-2 text-sm font-normal" style={{ color: C.muted }}>({s.zh_name})</span>}
                </div>
                <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: C.muted }}>
                  <span>{s.zoom_email ?? 'No email'}</span>
                  {s.auth_user_id && (
                    <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                      Classroom ✓
                    </span>
                  )}
                </div>
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
