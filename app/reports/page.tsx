import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Nav } from '@/components/layout/Nav'
import { ReportsClient } from './ReportsClient'

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

  const { data: myLessons } = await admin
    .from('lessons')
    .select('id')
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)

  const myLessonIds = (myLessons ?? []).map(l => l.id)

  const { data: reports } = await admin
    .from('lesson_reports')
    .select(`
      id, created_at, milestone, analysis_zh, analysis_en,
      vocabulary, phrases, strengths, errors, next_focus, next_focus_edit_count, homework, homework_translate_count, teacher_note,
      comparison, hidden_gem, next_challenge, parent_summary,
      lesson:lesson_id (
        id, date, time, duration,
        student:students!student_id ( zh_name, en_name, learner_type )
      )
    `)
    .in('lesson_id', myLessonIds.length > 0 ? myLessonIds : ['none'])
    .order('created_at', { ascending: false })
    .limit(100)

  // 撈學生的寫作作答與批改(reflection),依 lesson_report_id 對應。
  // 老師要即時看到學生寫了什麼、AI 如何批改,所以一併帶入。
  const reportIds = (reports ?? []).map(r => r.id)
  const { data: reflections } = await admin
    .from('reflection_responses')
    .select('lesson_report_id, question_zh, question_en, response, feedback')
    .in('lesson_report_id', reportIds.length > 0 ? reportIds : ['none'])

  const reflectionByReport: Record<string, any> = {}
  for (const rf of reflections ?? []) {
    reflectionByReport[rf.lesson_report_id] = rf
  }

  const reportsWithReflection = (reports ?? []).map(r => ({
    ...r,
    reflection: reflectionByReport[r.id] ?? null,
  }))

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <ReportsClient reports={reportsWithReflection as any[]} teacherName={teacher.teacher_name} />
    </>
  )
}
