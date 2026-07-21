'use client'
import { useState } from 'react'
import { C } from '@/lib/constants'
import { UploadReportModal } from '@/components/UploadReportModal'

type Lesson = {
  id: string
  date: string
  time: string | null
  duration: number | null
  status: string
  student: { id?: string; zh_name: string; en_name: string | null } | null
  account: { course_label: string } | null
}

export function DashboardClient({
  teacher, pendingReports, upcomingLessons, todayStr,
}: {
  teacher: { id: string; teacher_name: string; teacher_type: string }
  pendingReports: Lesson[]
  upcomingLessons: Lesson[]
  todayStr: string
}) {
  const [uploadLesson, setUploadLesson] = useState<Lesson | null>(null)
  const [uploaded, setUploaded] = useState<Set<string>>(new Set())

  const pending = pendingReports.filter(l => !uploaded.has(l.id))
  const todayLessons = upcomingLessons.filter(l => l.date === todayStr)
  const futureLessons = upcomingLessons.filter(l => l.date > todayStr)

  const fmtTime = (t: string | null) => t ? t.slice(0, 5) : ''

  const getStudent = (l: Lesson) => Array.isArray(l.student) ? l.student[0] : l.student

  const StudentName = ({ lesson }: { lesson: Lesson }) => {
    const s = getStudent(lesson)
    if (!s) return <span>—</span>
    return (
      <span>
        {s.en_name ?? s.zh_name}
        {s.en_name && <span className="ml-1.5 font-normal text-sm" style={{ color: C.muted }}>({s.zh_name})</span>}
      </span>
    )
  }

  const DateBadge = ({ date }: { date: string }) => (
    <div className="flex-shrink-0 text-center w-10 sm:w-12">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: C.muted }}>
        {date.slice(5, 7)}
      </div>
      <div className="font-serif text-[22px] sm:text-[24px] font-medium leading-none" style={{ color: C.navy }}>
        {date.slice(8)}
      </div>
    </div>
  )

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-6 sm:px-8 sm:py-8 space-y-8">

      {/* 歡迎 */}
      <div>
        <h1 className="font-serif text-[24px] sm:text-[28px] font-medium" style={{ color: C.navy }}>
          Hello, {teacher.teacher_name}.
        </h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Pending Reports */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[18px] font-semibold" style={{ color: C.navy }}>Pending Reports</h2>
          {pending.length > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
              style={{ background: C.red }}>{pending.length}</span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-8 text-center" style={{ borderColor: C.line }}>
            <p className="text-sm" style={{ color: C.muted }}>All lesson reports are up to date.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map(l => (
              <div key={l.id} className="rounded-2xl bg-white p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
                <div className="flex items-center gap-3 sm:contents">
                  <DateBadge date={l.date} />
                  <div className="hidden sm:block w-px self-stretch" style={{ background: C.line }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px]" style={{ color: C.navy }}>
                      <StudentName lesson={l} />
                    </div>
                    <div className="text-[13px] mt-0.5" style={{ color: C.muted }}>
                      {fmtTime(l.time)} · {l.duration ?? '?'} min
                    </div>
                  </div>
                </div>
                <button onClick={() => setUploadLesson(l)}
                  className="w-full sm:w-auto flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ background: C.navy }}>
                  Upload Report
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Today's Lessons */}
      {todayLessons.length > 0 && (
        <section>
          <h2 className="text-[18px] font-semibold mb-4" style={{ color: C.navy }}>Today's Lessons</h2>
          <div className="flex flex-col gap-3">
            {todayLessons.map(l => (
              <div key={l.id} className="flex items-center gap-3 rounded-2xl p-4 sm:p-5"
                style={{ background: '#EDE9E0', border: '1px solid rgba(26,34,54,0.1)' }}>
                <DateBadge date={l.date} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]" style={{ color: C.navy }}>
                    <StudentName lesson={l} />
                  </div>
                  <div className="text-[13px] mt-0.5" style={{ color: C.muted }}>
                    {fmtTime(l.time)} · {l.duration ?? '?'} min
                  </div>
                </div>
                <div className="font-serif text-[20px] font-medium flex-shrink-0" style={{ color: C.navy }}>
                  {fmtTime(l.time)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Lessons的課程 */}
      {futureLessons.length > 0 && (
        <section>
          <h2 className="text-[18px] font-semibold mb-4" style={{ color: C.navy }}>Upcoming Lessons</h2>
          <div className="flex flex-col gap-2">
            {futureLessons.map(l => (
              <div key={l.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <DateBadge date={l.date} />
                <div className="w-px self-stretch" style={{ background: C.line }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14px]" style={{ color: C.navy }}>
                    <StudentName lesson={l} />
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>
                    {fmtTime(l.time)} · {l.duration ?? '?'} min
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upload Modal */}
      {uploadLesson && (() => {
        const s = getStudent(uploadLesson)
        return (
          <UploadReportModal
            lessonId={uploadLesson.id}
            studentName={s?.en_name ?? s?.zh_name ?? ''}
            lessonDate={uploadLesson.date}
            teacherName={teacher.teacher_name}
            onGenerated={() => {
              setUploaded(prev => { const next = new Set(prev); next.add(uploadLesson.id); return next })
              setUploadLesson(null)
            }}
            onClose={() => setUploadLesson(null)}
          />
        )
      })()}
    </main>
  )
}
