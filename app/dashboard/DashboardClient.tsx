
function translateCourseLabel(label: string | null | undefined): string {
  if (!label) return '—'
  return label
    .replace('其他老師', 'Other Teacher')
    .replace('Hanne', 'Hanne')
    .replace('完整課', 'Full')
    .replace('短課', 'Short')
    .replace('試聽', 'Trial')
    .replace('分', ' min')
    .replace('堂', ' lessons')
}

'use client'
import { useState } from 'react'
import { C } from '@/lib/constants'
import { UploadReportModal } from '@/components/UploadReportModal'

type Lesson = {
  id: string
  date: string
  time: string | null
  duration: number | null
  class_type?: string
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

  return (
    <main className="mx-auto max-w-[1000px] px-5 py-8 sm:px-8 space-y-8">

      {/* 歡迎 */}
      <div>
        <h1 className="font-serif text-[28px] font-medium" style={{ color: C.navy }}>
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
          <div className="rounded-2xl border-2 border-dashed p-8 text-center"
            style={{ borderColor: C.line }}>
            <p className="text-sm" style={{ color: C.muted }}>🎉 All lesson reports are up to date.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map(l => {
              const s = Array.isArray(l.student) ? l.student[0] : l.student
              const a = Array.isArray(l.account) ? l.account[0] : l.account
              return (
                <div key={l.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex-shrink-0 text-center w-12">
                    <div className="text-[11px] uppercase tracking-wide" style={{ color: C.muted }}>
                      {l.date.slice(5, 7)}月
                    </div>
                    <div className="font-serif text-[24px] font-medium leading-none" style={{ color: C.navy }}>
                      {l.date.slice(8)}
                    </div>
                  </div>
                  <div className="w-px self-stretch" style={{ background: C.line }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px]" style={{ color: C.navy }}>
                      {s?.zh_name ?? '—'}
                      {s?.en_name && <span className="ml-1 text-sm font-normal" style={{ color: C.muted }}>({s.en_name})</span>}
                    </div>
                    <div className="text-[13px] mt-0.5" style={{ color: C.muted }}>
                      {translateCourseLabel(a?.course_label)} · {fmtTime(l.time)} · {l.duration ?? '?'} min
                    </div>
                  </div>
                  <button onClick={() => setUploadLesson(l)}
                    className="flex-shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                    style={{ background: C.navy }}>
                    Upload Report
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Today's Lessons */}
      {todayLessons.length > 0 && (
        <section>
          <h2 className="text-[18px] font-semibold mb-4" style={{ color: C.navy }}>Today's Lessons</h2>
          <div className="flex flex-col gap-3">
            {todayLessons.map(l => {
              const s = Array.isArray(l.student) ? l.student[0] : l.student
              const a = Array.isArray(l.account) ? l.account[0] : l.account
              return (
                <div key={l.id} className="flex items-center gap-4 rounded-2xl p-4 sm:p-5"
                  style={{ background: '#EAF4FF', border: '1px solid #B3D4F0' }}>
                  <div className="flex-1">
                    <div className="font-semibold text-[15px]" style={{ color: C.navy }}>
                      {s?.zh_name ?? '—'}
                      {s?.en_name && <span className="ml-1 text-sm font-normal" style={{ color: C.muted }}>({s.en_name})</span>}
                    </div>
                    <div className="text-[13px] mt-0.5" style={{ color: C.muted }}>
                      {a?.course_label} · {fmtTime(l.time)} · {l.duration ?? '?'} 分鐘
                    </div>
                  </div>
                  <div className="font-serif text-[22px] font-medium" style={{ color: C.navy }}>
                    {fmtTime(l.time)}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Upcoming Lessons */}
      {futureLessons.length > 0 && (
        <section>
          <h2 className="text-[18px] font-semibold mb-4" style={{ color: C.navy }}>Upcoming Lessons</h2>
          <div className="flex flex-col gap-2">
            {futureLessons.map(l => {
              const s = Array.isArray(l.student) ? l.student[0] : l.student
              const a = Array.isArray(l.account) ? l.account[0] : l.account
              return (
                <div key={l.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex-shrink-0 w-12 text-center">
                    <div className="text-[11px]" style={{ color: C.muted }}>{l.date.slice(5,7)}月</div>
                    <div className="font-serif text-[20px] font-medium" style={{ color: C.navy }}>{l.date.slice(8)}</div>
                  </div>
                  <div className="w-px self-stretch" style={{ background: C.line }} />
                  <div className="flex-1">
                    <div className="font-medium text-[14px]" style={{ color: C.navy }}>{s?.zh_name ?? '—'}</div>
                    <div className="text-[12px]" style={{ color: C.muted }}>{a?.course_label} · {fmtTime(l.time)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 上傳 Modal */}
      {uploadLesson && (() => {
        const s = Array.isArray(uploadLesson.student) ? uploadLesson.student[0] : uploadLesson.student
        return (
          <UploadReportModal
            lessonId={uploadLesson.id}
            studentName={s?.zh_name ?? ''}
            lessonDate={uploadLesson.date}
            teacherName={teacher.teacher_name}
            onGenerated={() => {
              setUploaded(prev => { const next = new Set(prev); next.add(uploadLesson.id); return next; })
              setUploadLesson(null)
            }}
            onClose={() => setUploadLesson(null)}
          />
        )
      })()}
    </main>
  )
}
