import { redirect } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Nav } from '@/components/layout/Nav'
import { PayrollClient } from './PayrollClient'
import { periodOf } from '@/lib/utils/period'

export const dynamic = 'force-dynamic'

export default async function PayrollPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

  // 查老師資料
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, teacher_name, teacher_type')
    .eq('auth_user_id', user.id)
    .single()

  if (!teacher) redirect('/dashboard')

  // 查 app_meta（php_rate）
  const { data: meta } = await admin
    .from('app_meta')
    .select('php_rate')
    .eq('id', 1)
    .single()

  const phpRate = meta?.php_rate ?? 1.8

  // 查所有完課課程（含學生資料）
  const { data: lessons } = await admin
    .from('lessons')
    .select(`
      id, date, time, duration, status, class_type,
      payout_snapshot,
      student:students!student_id ( en_name, zh_name ),
      report:lesson_reports!lesson_id ( id, created_at )
    `)
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)
    .eq('status', 'completed')
    .order('date', { ascending: false })

  // 查匯款期間
  const { data: periods } = await admin
    .from('remittance_periods')
    .select('*')
    .order('period_key', { ascending: false })
    .limit(12)

  // 查額外費用
  const { data: extras } = await admin
    .from('remittance_extras')
    .select('*')
    .eq('teacher_id', teacher.id)
    .order('date', { ascending: false })

  const displayName = teacher.teacher_name

  return (
    <>
      <Nav teacherName={displayName} />
      <PayrollClient
        teacher={teacher as any}
        lessons={(lessons ?? []) as any[]}
        periods={(periods ?? []) as any[]}
        extras={(extras ?? []) as any[]}
        phpRate={phpRate}
      />
    </>
  )
}
