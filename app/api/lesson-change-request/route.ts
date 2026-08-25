import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lessonId, type, reason, discussed, suggestedDate, suggestedTime } = await req.json()
  if (!lessonId || !type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const admin = createAdminClient()

  // 查老師資料
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, teacher_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  // 查課程資料
  const { data: lesson } = await admin
    .from('lessons')
    .select(`
      id, date, time, duration,
      student:students!student_id ( en_name, zh_name )
    `)
    .eq('id', lessonId)
    .single()

  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

  // 存申請記錄
  const id = 'lcr_' + Date.now().toString(36)
  await admin.from('lesson_change_requests').insert({
    id,
    lesson_id: lessonId,
    teacher_id: teacher.id,
    request_type: type,
    reason: reason || null,
    student_discussed: discussed,
    suggested_date: suggestedDate || null,
    suggested_time: suggestedTime || null,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // 發 Email 給 Lee
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const studentRel = lesson.student as any
  const studentName = Array.isArray(studentRel)
    ? (studentRel[0]?.en_name ?? studentRel[0]?.zh_name)
    : (studentRel?.en_name ?? studentRel?.zh_name) ?? 'Student'

  const typeLabel = type === 'leave' ? 'Leave Request' : 'Reschedule Request'
  const discussedText = discussed
    ? suggestedDate
      ? `✅ Already discussed with student. Suggested new time: ${suggestedDate} ${suggestedTime}`
      : '✅ Already discussed with student (no new time suggested yet)'
    : '❌ Not yet discussed — please help coordinate with the student'

  await resend.emails.send({
    from: 'Bridgeway Teacher Portal <classroom@bridgewayenglish.net>',
    to: 'bridgewayenglish123@gmail.com',
    subject: `[${typeLabel}] ${teacher.teacher_name} · ${studentName} · ${lesson.date}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
          Bridgeway <span style="color: #b8973a;">Admin</span>
        </div>
        <h2 style="font-size: 16px; color: #1a2236; margin-bottom: 16px;">${typeLabel}</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #6b7b8e; width: 140px;">Teacher</td><td style="color: #1a2236; font-weight: 600;">${teacher.teacher_name}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7b8e;">Student</td><td style="color: #1a2236; font-weight: 600;">${studentName}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7b8e;">Lesson Date</td><td style="color: #1a2236;">${lesson.date} ${lesson.time ? lesson.time.slice(0, 5) : ''}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7b8e;">Duration</td><td style="color: #1a2236;">${lesson.duration ?? '?'} min</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7b8e;">Reason</td><td style="color: #1a2236;">${reason || '(not provided)'}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7b8e; vertical-align: top;">Student Status</td><td style="color: #1a2236;">${discussedText}</td></tr>
        </table>
        <div style="margin-top: 24px; padding: 12px 16px; background: #f7f4ee; border-radius: 8px; font-size: 13px; color: #6b7b8e;">
          Please log in to Admin to update the lesson accordingly.
        </div>
        <a href="https://admin.bridgewayenglish.net/lessons"
           style="display: inline-block; margin-top: 16px; background: #1a2236; color: #f7f4ee; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Go to Admin
        </a>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
