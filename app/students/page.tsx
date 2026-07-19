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

  // 找排課規則 teacher_id 是這位老師的帳戶
  const { data: rules } = await admin
    .from('schedule_rules')
    .select('account_id')
    .eq('teacher_id', teacher.id)
    .eq('active_status', 'Active')

  const accountIds = Array.from(new Set((rules ?? []).map(r => r.account_id)))

  if (accountIds.length === 0) {
    return (
      <>
        <Nav teacherName={teacher.teacher_name} />
        <StudentsClient students={[]} />
      </>
    )
  }

  // 找這些帳戶的學生
  const { data: accounts } = await admin
    .from('accounts')
    .select(`
      id, course_label, total_lessons, status_override, is_trial,
      student:students!student_id(id, zh_name, en_name, status)
    `)
    .in('id', accountIds)

  // 去重
  const seen = new Set<string>()
  const students: any[] = []

  for (const acc of accounts ?? []) {
    const s = Array.isArray(acc.student) ? acc.student[0] : acc.student
    if (!s || seen.has(s.id)) continue
    if (s.status !== 'Active' && s.status !== 'Trial') continue
    seen.add(s.id)
    students.push({ student: s, account: acc })
  }

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <StudentsClient students={students} />
    </>
  )
}
