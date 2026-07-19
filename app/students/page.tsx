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

  // 找這位老師最近有 scheduled 課程的學生（active 帳戶）
  const { data: lessons } = await admin
    .from('lessons')
    .select(`
      student_id,
      student:students!student_id(id, zh_name, en_name, status),
      account:accounts!account_id(id, course_label, total_lessons, status_override, is_trial)
    `)
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)
    .eq('status', 'scheduled')
    .order('date', { ascending: true })

  // 去重，每個學生只留一筆
  const seen = new Set<string>()
  const students: any[] = []

  for (const l of lessons ?? []) {
    const s = Array.isArray(l.student) ? l.student[0] : l.student
    const a = Array.isArray(l.account) ? l.account[0] : l.account
    if (!s || seen.has(s.id)) continue
    // 只顯示 active/trial 狀態的學生
    if (s.status !== 'Active' && s.status !== 'Trial') continue
    seen.add(s.id)
    students.push({ student: s, account: a })
  }

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <StudentsClient students={students} />
    </>
  )
}
