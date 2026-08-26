import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Nav } from '@/components/layout/Nav'
import { SettingsClient } from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

  const { data: teacher } = await admin
    .from('teachers')
    .select('id, teacher_name, zoom_url')
    .eq('auth_user_id', user.id)
    .single()

  if (!teacher) redirect('/dashboard')

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <SettingsClient teacher={teacher as any} />
    </>
  )
}
