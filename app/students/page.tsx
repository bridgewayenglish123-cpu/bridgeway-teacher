import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Nav } from '@/components/layout/Nav'
import { StudentsClient } from './StudentsClient'

export const dynamic = 'force-dynamic'

export default async function StudentsPage() {
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

  // 只找 active 帳戶且最近課程是這位老師上的學生
  // 用 students.current_teacher_id 或最近 30 天有上過課
  const { data: accounts } = await admin
    .from('accounts')
    .select(`
      id, course_label, total_lessons, status_override, is_trial,
      student:students!student_id(id, zh_name, en_name, status, current_teacher_id)
    `)
    .in('status_override', ['Active', 'Trial', null])
    .not('status_override', 'eq', 'Closed')
    .not('status_override', 'eq', 'Completed')

  // 篩選：學生的 current_teacher_id 是這位老師
  const seen = new Set<string>()
  const students: any[] = []

  for (const acc of accounts ?? []) {
    const s = Array.isArray(acc.student) ? acc.student[0] : acc.student
    if (!s || seen.has(s.id)) continue

    // 只顯示 current_teacher_id 是這位老師的學生
    if (s.current_teacher_id === teacher.id) {
      seen.add(s.id)
      students.push({ student: s, account: acc })
    }
  }

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <StudentsClient students={students} />
    </>
  )
}
