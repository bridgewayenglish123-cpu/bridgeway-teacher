import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/layout/AdminNav'
import { ReportsClient } from '@/app/reports/ReportsClient'

export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const admin = createAdminClient()
  const { data: me } = await admin.from('teachers').select('id, teacher_name, role').eq('auth_user_id', user.id).single()
  if (!me || me.role !== 'admin') redirect('/dashboard')

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
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <>
      <AdminNav adminName={me.teacher_name} />
      <ReportsClient reports={(reports ?? []) as any[]} />
    </>
  )
}
