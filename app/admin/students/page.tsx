import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminNav } from '@/components/layout/AdminNav'

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
    .select('id, zh_name, en_name, status, zoom_email')
    .order('zh_name')

  return (
    <>
      <AdminNav adminName={me.teacher_name} />
      <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-8 sm:py-8">
        <h1 className="font-serif text-[28px] font-medium mb-6" style={{ color: '#1A3A5C' }}>All Students</h1>
        <div className="flex flex-col gap-2">
          {(students ?? []).map(s => (
            <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm flex items-center gap-4">
              <div className="flex-1">
                <div className="font-semibold" style={{ color: '#1A3A5C' }}>
                  {s.en_name ?? s.zh_name}
                  {s.en_name && <span className="ml-2 text-sm font-normal" style={{ color: '#6B7B8E' }}>({s.zh_name})</span>}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#6B7B8E' }}>{s.zoom_email ?? 'No email'}</div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: s.status === 'Active' ? '#E8F5E9' : s.status === 'Trial' ? '#FFF8E1' : '#F5F5F5',
                  color: s.status === 'Active' ? '#2E7D32' : s.status === 'Trial' ? '#F57F17' : '#9E9E9E',
                }}>
                {s.status}
              </span>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
