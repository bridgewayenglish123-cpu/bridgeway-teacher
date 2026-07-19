import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Nav } from '@/components/layout/Nav'
import { DashboardClient } from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

  // 找對應的老師
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, teacher_name, teacher_type, active_status')
    .eq('auth_user_id', user.id)
    .single()

  if (!teacher) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-lg mb-2" style={{ color: '#1A3A5C' }}>找不到老師資料</p>
          <p className="text-sm" style={{ color: '#6B7B8E' }}>請聯絡 Bridgeway 管理員。</p>
        </div>
      </div>
    )
  }

  // 找所有這位老師上過的已完課課程（含代課）
  const { data: pendingLessons } = await admin
    .from('lessons')
    .select(`
      id, date, time, duration, class_type, status,
      student:students!student_id ( id, zh_name, en_name ),
      account:accounts!account_id ( course_label ),
      lesson_reports ( id )
    `)
    .eq('teacher_id', teacher.id)
    .eq('status', 'completed')
    .eq('is_active', true)
    .order('date', { ascending: false })
    .limit(50)

  // 找今日和本週課程
  const today = new Date()
  const tw = new Date(today.getTime() + 8 * 60 * 60 * 1000)
  const todayStr = tw.toISOString().slice(0, 10)
  const weekStart = new Date(tw)
  weekStart.setDate(tw.getDate() - tw.getDay())
  const weekStartStr = weekStart.toISOString().slice(0, 10)

  const { data: upcomingLessons } = await admin
    .from('lessons')
    .select(`
      id, date, time, duration, status,
      student:students!student_id ( zh_name, en_name ),
      account:accounts!account_id ( course_label )
    `)
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)
    .in('status', ['scheduled'])
    .gte('date', todayStr)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(10)

  // 待上傳報告 = 已完課但無報告
  const pending = (pendingLessons ?? []).filter(l =>
    !l.lesson_reports || (l.lesson_reports as any[]).length === 0
  )

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <DashboardClient
        teacher={teacher}
        pendingReports={pending as any[]}
        upcomingLessons={(upcomingLessons ?? []) as any[]}
        todayStr={todayStr}
      />
    </>
  )
}
