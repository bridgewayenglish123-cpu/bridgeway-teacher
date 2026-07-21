'use client'
import { C } from '@/lib/constants'

type TeacherStat = {
  id: string
  teacher_name: string
  teacher_type: string
  active_status: string
  email: string | null
  auth_user_id: string | null
  portal_password_hint: string | null
  completedCount: number
  scheduledCount: number
  pendingReports: number
}

type Student = { id: string; zh_name: string; en_name: string | null; status: string }

type PendingLesson = {
  id: string
  date: string
  time: string | null
  duration: number | null
  teacher_id: string | null
  student: { zh_name: string; en_name: string | null } | null
}

export function AdminDashboardClient({
  teacherStats, students, pendingLessons,
}: {
  teacherStats: TeacherStat[]
  students: Student[]
  pendingLessons: PendingLesson[]
}) {
  const activeTeachers = teacherStats.filter(t => t.active_status === 'Active')
  const activeStudents = students.filter(s => s.status === 'Active' || s.status === 'Trial')
  const totalPending = pendingLessons.length

  const getStudent = (l: PendingLesson) =>
    Array.isArray(l.student) ? l.student[0] : l.student

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8 space-y-8">

      {/* 標題 */}
      <div>
        <h1 className="font-serif text-[28px] font-medium" style={{ color: C.navy }}>
          Overview
        </h1>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Teachers', value: activeTeachers.length },
          { label: 'Active Students', value: activeStudents.length },
          { label: 'Pending Reports', value: totalPending, highlight: totalPending > 0 },
          { label: 'Total Teachers', value: teacherStats.length },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white p-4 shadow-sm text-center">
            <div className="font-serif text-[32px] font-medium" style={{ color: s.highlight ? C.red : C.navy }}>
              {s.value}
            </div>
            <div className="text-[11px] mt-1" style={{ color: C.muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Teacher狀態 */}
      <section>
        <h2 className="text-[18px] font-semibold mb-4" style={{ color: C.navy }}>Teachers</h2>
        <div className="flex flex-col gap-3">
          {teacherStats.map(t => (
            <div key={t.id} className="rounded-2xl bg-white p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: t.active_status === 'Active' ? C.navy : C.muted }}>
                    {t.teacher_name[0]}
                  </div>
                  <div>
                    <div className="font-semibold" style={{ color: C.navy }}>{t.teacher_name}</div>
                    <div className="text-xs" style={{ color: C.muted }}>
                      {t.email ?? '—'}
                      {t.portal_password_hint && (
                        <span className="ml-2 font-mono" style={{ color: C.gold }}>
                          pw: {t.portal_password_hint}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="font-semibold text-sm" style={{ color: C.navy }}>{t.completedCount}</div>
                    <div className="text-[10px]" style={{ color: C.muted }}>completed</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-sm" style={{ color: C.navy }}>{t.scheduledCount}</div>
                    <div className="text-[10px]" style={{ color: C.muted }}>upcoming</div>
                  </div>
                  {t.pendingReports > 0 && (
                    <div className="text-center">
                      <div className="font-semibold text-sm" style={{ color: C.red }}>{t.pendingReports}</div>
                      <div className="text-[10px]" style={{ color: C.red }}>pending</div>
                    </div>
                  )}
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{
                      background: t.active_status === 'Active' ? '#E8F5E9' : '#F5F5F5',
                      color: t.active_status === 'Active' ? '#2E7D32' : '#9E9E9E',
                    }}>
                    {t.active_status}
                  </span>
                  {!t.auth_user_id && (
                    <span className="text-xs px-2.5 py-1 rounded-full"
                      style={{ background: '#FFF8E1', color: '#F57F17' }}>
                      No Portal
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pending Reports */}
      {pendingLessons.length > 0 && (
        <section>
          <h2 className="text-[18px] font-semibold mb-4" style={{ color: C.navy }}>
            Pending Reports
            <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-bold text-white"
              style={{ background: C.red }}>{pendingLessons.length}</span>
          </h2>
          <div className="flex flex-col gap-2">
            {pendingLessons.map(l => {
              const s = getStudent(l)
              const teacher = teacherStats.find(t => t.id === l.teacher_id)
              return (
                <div key={l.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex-shrink-0 text-center w-10">
                    <div className="text-[10px]" style={{ color: C.muted }}>{l.date.slice(5,7)}</div>
                    <div className="font-serif text-[20px] font-medium" style={{ color: C.navy }}>{l.date.slice(8)}</div>
                  </div>
                  <div className="w-px self-stretch" style={{ background: C.line }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[14px]" style={{ color: C.navy }}>
                      {s?.en_name ?? s?.zh_name ?? '—'}
                    </div>
                    <div className="text-[12px]" style={{ color: C.muted }}>
                      {teacher?.teacher_name ?? '—'} · {l.time?.slice(0,5)} · {l.duration} min
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: '#FEF2F2', color: C.red }}>
                    No report
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

    </main>
  )
}
