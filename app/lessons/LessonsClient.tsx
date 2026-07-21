'use client'
import { useState, useMemo, useEffect } from 'react'
import { C } from '@/lib/constants'
import { UploadReportModal } from '@/components/UploadReportModal'

type Lesson = {
  id: string
  date: string
  time: string | null
  duration: number | null
  teacherId: string | null
  studentId: string
  studentZh: string
  studentEn: string
  hasReport: boolean
  reportId?: string | null
}

const PAGE_SIZE = 20

export function LessonsClient({ lessons, teacherName, isAdmin }: {
  lessons: Lesson[]
  teacherName: string
  isAdmin: boolean
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'uploaded' | 'pending'>('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<{ lesson: Lesson; isReupload: boolean } | null>(null)
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(
    new Set(lessons.filter(l => l.hasReport).map(l => l.id))
  )

  const pendingCount = lessons.filter(l => !uploadedIds.has(l.id)).length
  const uploadedCount = lessons.length - pendingCount

  const filtered = useMemo(() => {
    let list = [...lessons]
    if (filter === 'uploaded') list = list.filter(l => uploadedIds.has(l.id))
    if (filter === 'pending') list = list.filter(l => !uploadedIds.has(l.id))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(l =>
        l.studentZh.toLowerCase().includes(q) ||
        l.studentEn.toLowerCase().includes(q) ||
        l.date.includes(q)
      )
    }
    list.sort((a, b) => sort === 'newest'
      ? b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '')
      : a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')
    )
    return list
  }, [lessons, search, filter, sort, uploadedIds])

  useEffect(() => { setPage(1) }, [search, filter, sort])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <main className="mx-auto max-w-[860px] px-4 py-6 sm:px-8 sm:py-8 pb-24 sm:pb-8"
      style={{ background: '#F7F4EE', minHeight: '100dvh' }}>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between">
          <h1 className="font-serif text-[26px] sm:text-[30px] font-medium" style={{ color: C.navy }}>
            Lesson History
          </h1>
          <div className="text-[13px]" style={{ color: C.muted }}>
            {pendingCount > 0 && (
              <span className="mr-2 font-medium" style={{ color: C.red }}>{pendingCount} pending</span>
            )}
            {lessons.length} lessons total
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
        {[
          { label: 'All', value: lessons.length, color: C.navy },
          { label: 'Pending', value: pendingCount, color: C.red },
          { label: 'Uploaded', value: uploadedCount, color: C.green },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white p-3 sm:p-4 text-center shadow-sm">
            <div className="font-serif text-[24px] sm:text-[28px] font-medium" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input type="text" placeholder="Search student name..."
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full rounded-2xl border px-4 py-2.5 text-[14px] outline-none transition mb-3"
        style={{ borderColor: C.line, color: C.navy, background: '#fff',
          boxShadow: '0 1px 4px rgba(26,34,54,0.04)' }} />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        <div className="flex gap-1 rounded-xl p-1 flex-1 sm:flex-none" style={{ background: '#EDE9E0' }}>
          {([
            { v: 'all', l: 'All' },
            { v: 'pending', l: 'Pending' },
            { v: 'uploaded', l: 'Uploaded' },
          ] as const).map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className="flex-1 sm:flex-none rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
              style={{ background: filter === f.v ? C.navy : 'transparent', color: filter === f.v ? '#fff' : C.muted }}>
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EDE9E0' }}>
          {([{ v: 'newest', l: 'Newest' }, { v: 'oldest', l: 'Oldest' }] as const).map(s => (
            <button key={s.v} onClick={() => setSort(s.v)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
              style={{ background: sort === s.v ? C.navy : 'transparent', color: sort === s.v ? '#fff' : C.muted }}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      {(search || filter !== 'all') && (
        <div className="text-[12px] mb-3" style={{ color: C.muted }}>{filtered.length} results</div>
      )}

      {/* Lesson list */}
      <div className="flex flex-col gap-2 mb-6">
        {paginated.map(l => {
          const uploaded = uploadedIds.has(l.id)
          const name = l.studentEn || l.studentZh
          const month = new Date(l.date + 'T00:00:00').toLocaleString('en', { month: 'short' })
          return (
            <div key={l.id}
              className="rounded-2xl bg-white p-4 shadow-sm flex items-center gap-3 sm:gap-4"
              style={{ borderLeft: `3px solid ${uploaded ? C.green : C.line}` }}>
              {/* Date */}
              <div className="flex-shrink-0 text-center w-9 sm:w-11">
                <div className="text-[10px] font-medium uppercase" style={{ color: C.muted }}>{month}</div>
                <div className="font-serif text-[22px] sm:text-[26px] font-medium leading-none mt-0.5" style={{ color: C.navy }}>
                  {l.date.slice(8)}
                </div>
              </div>
              <div className="w-px self-stretch" style={{ background: C.line }} />
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] sm:text-[15px] truncate" style={{ color: C.navy }}>{name}</div>
                <div className="text-[11px] sm:text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: C.muted }}>
                  {l.time && <span>{l.time.slice(0, 5)}</span>}
                  {l.duration && <><span>·</span><span>{l.duration} min</span></>}
                </div>
              </div>
              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-2">
                {uploaded ? (
                  <>
                    <span className="text-[11px] sm:text-[12px] px-2.5 py-1.5 rounded-full font-medium"
                      style={{ background: '#E8F5E9', color: '#2E7D32' }}>✓ Uploaded</span>
                    <button
                      onClick={() => setModal({ lesson: l, isReupload: true })}
                      className="text-[11px] sm:text-[12px] px-2.5 py-1.5 rounded-full font-medium transition active:scale-95"
                      style={{ background: '#F0EDE6', color: C.navy }}>
                      Regenerate
                    </button>
                  </>
                ) : (
                  <button onClick={() => setModal({ lesson: l, isReupload: false })}
                    className="text-[11px] sm:text-[12px] px-2.5 py-1.5 rounded-full font-medium transition active:scale-95"
                    style={{ background: C.gold, color: '#fff' }}>
                    Upload Report
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {paginated.length === 0 && (
          <div className="rounded-2xl border border-dashed py-12 text-center" style={{ borderColor: C.line }}>
            <p className="text-[14px]" style={{ color: C.muted }}>
              {search || filter !== 'all' ? 'No lessons found.' : 'No completed lessons yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0) }}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition disabled:opacity-40"
            style={{ background: '#fff', color: C.navy, border: `1px solid ${C.line}` }}>
            ← Previous
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '...')[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i-1] as number) > 1) acc.push('...')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) => p === '...'
                ? <span key={`e${i}`} className="text-[13px]" style={{ color: C.muted }}>…</span>
                : <button key={p} onClick={() => { setPage(p as number); window.scrollTo(0, 0) }}
                    className="w-8 h-8 rounded-lg text-[13px] font-medium transition"
                    style={{
                      background: page === p ? C.navy : '#fff',
                      color: page === p ? '#fff' : C.navy,
                      border: `1px solid ${page === p ? C.navy : C.line}`,
                    }}>{p}</button>
              )}
          </div>
          <button
            onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0, 0) }}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition disabled:opacity-40"
            style={{ background: '#fff', color: C.navy, border: `1px solid ${C.line}` }}>
            Next →
          </button>
        </div>
      )}

      {totalPages > 1 && (
        <div className="text-center text-[12px] mt-3" style={{ color: C.muted }}>
          Page {page} of {totalPages} · {PAGE_SIZE} per page
        </div>
      )}

      {/* Upload / Regenerate Modal */}
      {modal && (
        <UploadReportModal
          lessonId={modal.lesson.id}
          studentName={modal.lesson.studentEn || modal.lesson.studentZh}
          lessonDate={modal.lesson.date}
          teacherName={teacherName}
          existingReportId={modal.isReupload ? (modal.lesson.reportId ?? undefined) : undefined}
          onGenerated={() => {
            setUploadedIds(prev => {
              const next = new Set(Array.from(prev))
              next.add(modal!.lesson.id)
              return next
            })
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  )
}
