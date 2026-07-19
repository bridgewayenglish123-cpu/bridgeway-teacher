import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Nav } from '@/components/layout/Nav'

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

  // 找這位老師負責的所有學生（有上過課的）
  const { data: lessons } = await admin
    .from('lessons')
    .select('student_id, student:students!student_id(id, zh_name, en_name, status), account:accounts!account_id(course_label, total_lessons, status_override)')
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)
    .order('date', { ascending: false })

  // 去重，每個學生只留一筆
  const seen = new Set<string>()
  const students: any[] = []
  for (const l of lessons ?? []) {
    const s = Array.isArray(l.student) ? l.student[0] : l.student
    if (s && !seen.has(s.id)) {
      seen.add(s.id)
      students.push({ student: s, account: Array.isArray(l.account) ? l.account[0] : l.account })
    }
  }

  return (
    <>
      <Nav teacherName={teacher.teacher_name} />
      <main className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
        <h1 className="font-serif text-[28px] font-medium mb-6" style={{ color: '#1A3A5C' }}>
          我的學生
        </h1>
        <div className="flex flex-col gap-3">
          {students.map(({ student: s, account: a }) => (
            <div key={s.id} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex-1">
                <div className="font-semibold text-[16px]" style={{ color: '#1A3A5C' }}>
                  {s.zh_name}
                  {s.en_name && <span className="ml-2 text-sm font-normal" style={{ color: '#6B7B8E' }}>({s.en_name})</span>}
                </div>
                {a && (
                  <div className="text-[13px] mt-0.5" style={{ color: '#6B7B8E' }}>
                    {a.course_label}
                  </div>
                )}
              </div>
              <div className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: s.status === 'Active' ? '#E8F5E9' : '#F5F5F5',
                  color: s.status === 'Active' ? '#2E7D4F' : '#9E9E9E'
                }}>
                {s.status === 'Active' ? '在學中' : s.status === 'Paused' ? '暫停' : '已結束'}
              </div>
            </div>
          ))}
          {students.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: '#6B7B8E' }}>
              還沒有學生資料。
            </div>
          )}
        </div>
      </main>
    </>
  )
}
