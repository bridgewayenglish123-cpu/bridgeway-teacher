import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/layout/AdminNav'
import { AdminStudentsClient } from './AdminStudentsClient'

export const dynamic = 'force-dynamic'

export default async function AdminStudentsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const admin = createAdminClient()
  const { data: me } = await admin.from('teachers').select('id, teacher_name, role').eq('auth_user_id', user.id).single()
  if (!me || me.role !== 'admin') redirect('/dashboard')

  const { data: students } = await admin
    .from('students')
    .select('id, zh_name, en_name, status, zoom_email, auth_user_id')
    .order('zh_name')

  return (
    <>
      <AdminNav adminName={me.teacher_name} />
      <AdminStudentsClient students={(students ?? []) as any[]} />
    </>
  )
}
