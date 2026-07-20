import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Nav } from '@/components/layout/Nav'
import { LessonsClient } from './LessonsClient'

export const dynamic = 'force-dynamic'

export default async function LessonsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, teacher_name, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!teacher) redirect('/auth/login')

  // 撈所有完課課程（依角色篩選）
  let query = admin
    .from('lessons')
    .select(`
      id, date, time, duration, class_type, status, teacher_id,
      student:students!student_id ( id, zh_name, en_name ),
      lesson_reports ( id )
    `)
    .eq('status', 'completed')
    .eq('is_active', true)
    .order('date', { ascending: false })
    .order('time', { ascending: false })

  if (teacher.role !== 'admin') {
    query = query.eq('teacher_id', teacher.id)
  }

  const { data: lessons } = await query

  const allLessons = (lessons ?? []).map((l: any) => {
    const student = Array.isArray(l.student) ? l.student[0] : l.student
    const hasReport = l.lesson_reports && l.lesson_reports.length > 0
    return {
      id: l.id,
      date: l.date,
      time: l.time,
      duration: l.duration,
      teacherId: l.teacher_id,
      studentId: student?.id ?? '',
      studentZh: student?.zh_name ?? '',
      studentEn: student?.en_name ?? '',
      hasReport,
    }
  })

  return (
    <>
      <Nav name={teacher.teacher_name} />
      <LessonsClient lessons={allLessons} teacherName={teacher.teacher_name} isAdmin={teacher.role === 'admin'} />
    </>
  )
}
