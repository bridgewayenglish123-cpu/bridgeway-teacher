import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lessonId } = await req.json()
  if (!lessonId) return NextResponse.json({ error: 'lessonId required' }, { status: 400 })

  const admin = createAdminClient()

  // 查老師
  const { data: teacher } = await admin
    .from('teachers')
    .select('id, teacher_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  // 查課程
  const { data: lesson } = await admin
    .from('lessons')
    .select(`
      id, date, time, duration,
      student:students!student_id ( en_name, zh_name )
    `)
    .eq('id', lessonId)
    .single()

  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

  const student = Array.isArray(lesson.student) ? lesson.student[0] : lesson.student
  const studentName = (student as any)?.en_name ?? (student as any)?.zh_name ?? 'Student'

  // 標記為 pending_confirmation + 備註曠課
  await admin
    .from('lessons')
    .update({
      status: 'pending_confirmation',
      note: '學生曠課（老師已出席）',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId)

  // 發 Email 給 Lee
  const resend = new Resend(process.env.RESEND_API_KEY!)
  await resend.emails.send({
    from: 'Bridgeway Teacher Portal <classroom@bridgewayenglish.net>',
    to: 'bridgewayenglish123@gmail.com',
    subject: `[曠課回報] ${teacher.teacher_name} · ${studentName} · ${lesson.date}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
          Bridgeway <span style="color: #b8973a;">Admin</span>
        </div>
        <h2 style="font-size: 16px; color: #1a2236; margin-bottom: 16px;">學生曠課通知</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #6b7b8e; width: 100px;">老師</td><td style="color: #1a2236; font-weight: 600;">${teacher.teacher_name}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7b8e;">學生</td><td style="color: #1a2236; font-weight: 600;">${studentName}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7b8e;">日期</td><td style="color: #1a2236;">${lesson.date} ${lesson.time ? lesson.time.slice(0,5) : ''}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7b8e;">時長</td><td style="color: #1a2236;">${lesson.duration ?? '?'} 分鐘</td></tr>
        </table>
        <div style="margin-top: 20px; padding: 12px 16px; background: #FEF3C7; border-radius: 8px; font-size: 13px; color: #92400E;">
          老師已正常出席，此堂需計入薪資。請在 Admin 確認完課。
        </div>
        <a href="https://admin.bridgewayenglish.net/lessons"
           style="display: inline-block; margin-top: 16px; background: #1a2236; color: #f7f4ee; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          前往 Admin 確認
        </a>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
