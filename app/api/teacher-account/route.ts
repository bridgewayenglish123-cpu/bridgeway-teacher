import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const { teacherId, email, password, teacherName, authUserId, action } = await req.json()
  const admin = createAdminClient()

  if (action === 'create') {
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { teacher_name: teacherName, role: 'teacher' },
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })
    await admin.from('teachers').update({
      auth_user_id: authData.user.id,
      email,
      portal_password_hint: password,
    }).eq('id', teacherId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'reset') {
    const { error } = await admin.auth.admin.updateUserById(authUserId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await admin.from('teachers').update({ portal_password_hint: password }).eq('id', teacherId)
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { error } = await admin.auth.admin.deleteUser(authUserId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await admin.from('teachers').update({ auth_user_id: null, portal_password_hint: null }).eq('id', teacherId)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
