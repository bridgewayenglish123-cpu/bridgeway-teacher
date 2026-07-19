import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Nav } from '@/components/layout/Nav'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, teacher_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!teacher) redirect('/dashboard')

  const { data: reports } = await admin
    .from('lesson_reports')
    .select(`
      id, created_at, milestone,
      analysis_zh,
      lesson:lesson_id (
        id, date, time, duration,
        student:students!student_id ( zh_name, en_name )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  // 篩選這位老師的報告（透過 lesson.teacher_id）
  const { data: myLessons } = await admin
    .from('lessons')
    .select('id')
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)

  const myLessonIds = new Set((myLessons ?? []).map(l => l.id))
  const myReports = (reports ?? []).filter(r => {
    const lesson = Array.isArray(r.lesson) ? r.lesson[0] : r.lesson
    return lesson && myLessonIds.has(lesson.id)
  })

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <main className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
        <h1 className="font-serif text-[28px] font-medium mb-6" style={{ color: '#1A3A5C' }}>
          報告管理
        </h1>
        <div className="flex flex-col gap-3">
          {myReports.map(r => {
            const lesson = Array.isArray(r.lesson) ? r.lesson[0] : r.lesson
            const student = lesson ? (Array.isArray(lesson.student) ? lesson.student[0] : lesson.student) : null
            const analysis = r.analysis_zh as any
            return (
              <div key={r.id} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm border-l-[3px] border-yellow-400">
                <div className="flex-shrink-0 text-center w-12">
                  <div className="text-[11px]" style={{ color: '#6B7B8E' }}>{lesson?.date?.slice(5,7)}月</div>
                  <div className="font-serif text-[22px] font-medium" style={{ color: '#1A3A5C' }}>{lesson?.date?.slice(8)}</div>
                </div>
                <div className="w-px self-stretch" style={{ background: '#DDE3EA' }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]" style={{ color: '#1A3A5C' }}>
                    {student?.zh_name ?? '—'}
                    {student?.en_name && <span className="ml-1 text-sm font-normal" style={{ color: '#6B7B8E' }}>({student.en_name})</span>}
                  </div>
                  {analysis?.headline && (
                    <div className="text-[13px] mt-0.5 line-clamp-1" style={{ color: '#6B7B8E' }}>
                      {analysis.headline}
                    </div>
                  )}
                </div>
                <a href={`https://app.bridgewayenglish.net/report/${lesson?.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: '#EAF0F6', color: '#1A3A5C' }}>
                  查看
                </a>
              </div>
            )
          })}
          {myReports.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: '#6B7B8E' }}>
              還沒有報告記錄。
            </div>
          )}
        </div>
      </main>
    </>
  )
}
