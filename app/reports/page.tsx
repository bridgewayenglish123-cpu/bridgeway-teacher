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
      vocabulary, phrases, strengths, errors, next_focus,
      lesson:lesson_id (
        id, date, time, duration,
        student:students!student_id ( zh_name, en_name )
      )
    `)
    .in('lesson_id', myLessonIds.length > 0 ? myLessonIds : ['none'])
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <ReportsClient reports={(reports ?? []) as any[]} />
    </>
  )
}
