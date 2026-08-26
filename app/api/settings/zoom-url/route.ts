import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { zoomUrl, zoomMeetingId, zoomPassword } = await req.json()

  const admin = createAdminClient()

  const { data: teacher } = await admin
    .from('teachers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  const { error } = await admin
    .from('teachers')
    .update({
      zoom_url: zoomUrl || null,
      zoom_meeting_id: zoomMeetingId || null,
      zoom_password: zoomPassword || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', teacher.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
