import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/layout/AdminNav'
import { AdminTeachersClient } from './AdminTeachersClient'

export const dynamic = 'force-dynamic'

export default async function AdminTeachersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()
  const { data: me } = await admin.from('teachers').select('id, teacher_name, role').eq('auth_user_id', user.id).single()
  if (!me || me.role !== 'admin') redirect('/dashboard')

  const { data: teachers } = await admin
    .from('teachers')
    .select('id, teacher_code, teacher_name, teacher_type, active_status, email, auth_user_id, portal_password_hint, role')
    .order('teacher_name')

  return (
    <>
      <AdminNav adminName={me.teacher_name} />
      <AdminTeachersClient teachers={(teachers ?? []) as any[]} />
    </>
  )
}
