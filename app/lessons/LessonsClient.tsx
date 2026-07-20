'use client'
import { useState, useMemo } from 'react'
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
}

export function LessonsClient({ lessons, teacherName, isAdmin }: {
  lessons: Lesson[]
  teacherName: string
  isAdmin: boolean
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'uploaded' | 'pending'>('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [modal, setModal] = useState<{ lesson: Lesson } | null>(null)
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(
    new Set(lessons.filter(l => l.hasReport).map(l => l.id))
  )

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

  const pendingCount = lessons.filter(l => !uploadedIds.has(l.id)).length

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="font-serif text-[28px] font-medium" style={{ color: C.navy }}>課程記錄</h1>
        <div className="text-sm" style={{ color: C.muted }}>
          {pendingCount > 0 && <span style={{ color: C.red }}>{pendingCount} 待上傳　</span>}
          共 {lessons.length} 堂
        </div>
      </div>

      {/* 搜尋篩選 */}
      <div className="flex flex-col gap-3 mb-5">
        <input type="text" placeholder="搜尋學生姓名..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
          style={{ borderColor: C.line, color: C.navy }} />
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EAF0F6' }}>
            {([
              { v: 'all', l: `全部 (${lessons.length})` },
              { v: 'pending', l: `待上傳 (${pendingCount})` },
              { v: 'uploaded', l: `已上傳 (${lessons.length - pendingCount})` },
            ] as const).map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
                style={{ background: filter === f.v ? C.navy : 'transparent', color: filter === f.v ? '#fff' : C.muted }}>
                {f.l}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EAF0F6' }}>
            {([{ v: 'newest', l: '最新' }, { v: 'oldest', l: '最舊' }] as const).map(s => (
              <button key={s.v} onClick={() => setSort(s.v)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
                style={{ background: sort === s.v ? C.navy : 'transparent', color: sort === s.v ? '#fff' : C.muted }}>
                {s.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 課程列表 */}
      <div className="flex flex-col gap-2">
        {filtered.map(l => {
          const uploaded = uploadedIds.has(l.id)
          const name = l.studentEn || l.studentZh
          return (
            <div key={l.id} className="rounded-2xl bg-white p-4 shadow-sm flex items-center gap-4">
              <div className="flex-shrink-0 text-center w-10">
                <div className="text-[10px]" style={{ color: C.muted }}>{l.date.slice(5, 7)}</div>
                <div className="font-serif text-[22px] font-medium" style={{ color: C.navy }}>{l.date.slice(8)}</div>
              </div>
              <div className="w-px self-stretch" style={{ background: C.line }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px]" style={{ color: C.navy }}>{name}</div>
                <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>
                  {l.time?.slice(0, 5) ?? '—'}{l.duration ? ` · ${l.duration} 分鐘` : ''}
                </div>
              </div>
              <div className="flex-shrink-0">
                {uploaded ? (
                  <span className="text-[12px] px-3 py-1.5 rounded-full font-medium"
                    style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                    ✓ 已上傳
                  </span>
                ) : (
                  <button onClick={() => setModal({ lesson: l })}
                    className="text-[12px] px-3 py-1.5 rounded-full font-medium transition hover:opacity-80"
                    style={{ background: C.gold, color: '#fff' }}>
                    上傳報告
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: C.muted }}>找不到符合的課程</div>
        )}
      </div>

      {/* Upload Modal */}
      {modal && (
        <UploadReportModal
          lessonId={modal.lesson.id}
          studentName={modal.lesson.studentEn || modal.lesson.studentZh}
          lessonDate={modal.lesson.date}
          teacherName={teacherName}
          onGenerated={() => {
            setUploadedIds(prev => { const next = new Set(Array.from(prev)); next.add(modal!.lesson.id); return next; })
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  )
}
