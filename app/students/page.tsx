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

  const { data: lessons } = await admin
    .from('lessons')
    .select(`
      id, date, status,
      student:students!student_id(id, zh_name, en_name, status),
      account:accounts!account_id(id, course_label, total_lessons, status_override, is_trial)
    `)
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)
    .order('date', { ascending: false })

  // 去重，每個學生只留最新
  const seen = new Set<string>()
  const students: any[] = []
  for (const l of lessons ?? []) {
    const s = Array.isArray(l.student) ? l.student[0] : l.student
    const a = Array.isArray(l.account) ? l.account[0] : l.account
    if (s && !seen.has(s.id)) {
      seen.add(s.id)
      students.push({ student: s, account: a, latestDate: l.date })
    }
  }

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <StudentsClient students={students} />
    </>
  )
}
