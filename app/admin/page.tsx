import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/layout/AdminNav'
import { AdminDashboardClient } from './AdminDashboardClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

  // 確認是管理員
  const { data: me } = await admin
    .from('teachers')
    .select('id, teacher_name, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!me || me.role !== 'admin') redirect('/dashboard')

  // 所有老師
  const { data: teachers } = await admin
    .from('teachers')
    .select('id, teacher_name, teacher_type, active_status, email, auth_user_id, portal_password_hint')
    .order('teacher_name')

  // 所有學生
  const { data: students } = await admin
    .from('students')
    .select('id, zh_name, en_name, status')
    .order('zh_name')

  // 所有待上傳報告（2026-07-19 之後完課但無報告）
  const { data: pendingLessons } = await admin
    .from('lessons')
    .select(`
      id, date, time, duration, teacher_id,
      student:students!student_id(id, zh_name, en_name),
      account:accounts!account_id(course_label),
      lesson_reports(id)
    `)
    .eq('status', 'completed')
    .eq('is_active', true)
    .gte('date', '2026-07-19')
    .order('date', { ascending: false })

  const pending = (pendingLessons ?? []).filter(l =>
    !l.lesson_reports || (l.lesson_reports as any[]).length === 0
  )

  // 每位老師的統計
  const { data: allLessons } = await admin
    .from('lessons')
    .select('teacher_id, status, is_active, date')
    .eq('is_active', true)
    .gte('date', '2026-07-01')

  const teacherStats = (teachers ?? []).map(t => {
    const tLessons = (allLessons ?? []).filter(l => l.teacher_id === t.id)
    const pendingCount = pending.filter(l => l.teacher_id === t.id).length
    return {
      ...t,
      completedCount: tLessons.filter(l => l.status === 'completed').length,
      scheduledCount: tLessons.filter(l => l.status === 'scheduled').length,
      pendingReports: pendingCount,
    }
  })

  return (
    <>
      <AdminNav adminName={me.teacher_name} />
      <AdminDashboardClient
        teacherStats={teacherStats as any[]}
        students={(students ?? []) as any[]}
        pendingLessons={pending as any[]}
      />
    </>
  )
}
