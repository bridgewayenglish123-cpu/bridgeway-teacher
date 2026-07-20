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

  return (
    <main className="mx-auto max-w-[860px] px-4 py-6 sm:px-8 sm:py-8 pb-24 sm:pb-8"
      style={{ background: C.bg, minHeight: '100dvh' }}>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between">
          <h1 className="font-serif text-[26px] sm:text-[30px] font-medium" style={{ color: C.navy }}>
            課程記錄
          </h1>
          <div className="text-[13px]" style={{ color: C.muted }}>
            {pendingCount > 0 && (
              <span className="mr-2 font-medium" style={{ color: C.red }}>{pendingCount} 待上傳</span>
            )}
            共 {lessons.length} 堂
          </div>
        </div>
      </div>

      {/* 統計卡 — 手機 2 格，桌機 3 格 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
        {[
          { label: '全部', value: lessons.length, color: C.navy },
          { label: '待上傳', value: pendingCount, color: C.red },
          { label: '已上傳', value: uploadedCount, color: C.green },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white p-3 sm:p-4 text-center shadow-sm">
            <div className="font-serif text-[24px] sm:text-[28px] font-medium" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 搜尋 */}
      <input type="text" placeholder="搜尋學生姓名..."
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full rounded-2xl border px-4 py-2.5 text-[14px] outline-none transition mb-3"
        style={{ borderColor: C.line, color: C.navy, background: '#fff',
          boxShadow: '0 1px 4px rgba(26,34,54,0.04)' }} />

      {/* 篩選 + 排序 */}
      <div className="flex gap-2 flex-wrap mb-5">
        <div className="flex gap-1 rounded-xl p-1 flex-1 sm:flex-none" style={{ background: '#EDE9E0' }}>
          {([
            { v: 'all', l: `全部` },
            { v: 'pending', l: `待上傳` },
            { v: 'uploaded', l: `已上傳` },
          ] as const).map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className="flex-1 sm:flex-none rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
              style={{
                background: filter === f.v ? C.navy : 'transparent',
                color: filter === f.v ? '#fff' : C.muted,
              }}>
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EDE9E0' }}>
          {([{ v: 'newest', l: '最新' }, { v: 'oldest', l: '最舊' }] as const).map(s => (
            <button key={s.v} onClick={() => setSort(s.v)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
              style={{
                background: sort === s.v ? C.navy : 'transparent',
                color: sort === s.v ? '#fff' : C.muted,
              }}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* 結果數 */}
      {(search || filter !== 'all') && (
        <div className="text-[12px] mb-3" style={{ color: C.muted }}>
          找到 {filtered.length} 筆
        </div>
      )}

      {/* 課程列表 */}
      <div className="flex flex-col gap-2">
        {filtered.map(l => {
          const uploaded = uploadedIds.has(l.id)
          const name = l.studentEn || l.studentZh
          const month = l.date.slice(5, 7)
          const day = l.date.slice(8)

          return (
            <div key={l.id}
              className="rounded-2xl bg-white p-4 shadow-sm flex items-center gap-3 sm:gap-4"
              style={{ borderLeft: uploaded ? `3px solid ${C.green}` : `3px solid ${C.line}` }}>

              {/* 日期 */}
              <div className="flex-shrink-0 text-center w-9 sm:w-11">
                <div className="text-[10px] font-medium" style={{ color: C.muted }}>{month}月</div>
                <div className="font-serif text-[22px] sm:text-[26px] font-medium leading-none mt-0.5"
                  style={{ color: C.navy }}>{day}</div>
              </div>

              <div className="w-px self-stretch" style={{ background: C.line }} />

              {/* 內容 */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] sm:text-[15px] truncate" style={{ color: C.navy }}>
                  {name}
                </div>
                <div className="text-[11px] sm:text-[12px] mt-0.5 flex items-center gap-1.5 flex-wrap"
                  style={{ color: C.muted }}>
                  {l.time && <span>{l.time.slice(0, 5)}</span>}
                  {l.duration && <><span>·</span><span>{l.duration} 分鐘</span></>}
                </div>
              </div>

              {/* 狀態按鈕 */}
              <div className="flex-shrink-0">
                {uploaded ? (
                  <span className="text-[11px] sm:text-[12px] px-2.5 py-1.5 rounded-full font-medium"
                    style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                    ✓ 已上傳
                  </span>
                ) : (
                  <button onClick={() => setModal({ lesson: l })}
                    className="text-[11px] sm:text-[12px] px-2.5 py-1.5 rounded-full font-medium transition active:scale-95"
                    style={{ background: C.gold, color: '#fff' }}>
                    上傳報告
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed py-12 text-center"
            style={{ borderColor: C.line }}>
            <p className="text-[14px]" style={{ color: C.muted }}>
              {search || filter !== 'all' ? '找不到符合的課程' : '還沒有完課記錄'}
            </p>
          </div>
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
