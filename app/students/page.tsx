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

  // Active 學生：排課規則 teacher_id 是這位老師
  const { data: rules } = await admin
    .from('schedule_rules')
    .select('account_id')
    .eq('teacher_id', teacher.id)
    .eq('active_status', 'Active')

  const activeAccountIds = Array.from(new Set((rules ?? []).map(r => r.account_id)))

  const { data: activeAccounts } = activeAccountIds.length > 0
    ? await admin
        .from('accounts')
        .select('id, course_label, total_lessons, status_override, is_trial, student:students!student_id(id, zh_name, en_name, status)')
        .in('id', activeAccountIds)
    : { data: [] }

  // All 學生：曾經跟這位老師上過課
  const { data: allLessons } = await admin
    .from('lessons')
    .select('student_id, student:students!student_id(id, zh_name, en_name, status), account:accounts!account_id(id, course_label, status_override, is_trial)')
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)
    .order('date', { ascending: false })

  // 整理 active 學生
  const activeStudents: any[] = []
  const activeSeen = new Set<string>()
  for (const acc of activeAccounts ?? []) {
    const s = Array.isArray(acc.student) ? acc.student[0] : acc.student
    if (!s || activeSeen.has(s.id)) continue
    activeSeen.add(s.id)
    activeStudents.push({ student: s, account: acc, isActive: true })
  }

  // 整理 all 學生（含歷史）
  const allStudents: any[] = [...activeStudents]
  const allSeen = new Set<string>(Array.from(activeSeen))
  for (const l of allLessons ?? []) {
    const s = Array.isArray(l.student) ? l.student[0] : l.student
    const a = Array.isArray(l.account) ? l.account[0] : l.account
    if (!s || allSeen.has(s.id)) continue
    allSeen.add(s.id)
    allStudents.push({ student: s, account: a, isActive: false })
  }

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <StudentsClient activeStudents={activeStudents} allStudents={allStudents} />
    </>
  )
}
