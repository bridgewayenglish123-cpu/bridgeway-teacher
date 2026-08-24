import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vercel Cron 安全驗證
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const now = new Date()

  // 查 reminder_start_date 設定
  const { data: meta } = await admin
    .from('app_meta')
    .select('reminder_start_date')
    .eq('id', 1)
    .single()

  const reminderStartDate = meta?.reminder_start_date ?? null
  if (!reminderStartDate) {
    return NextResponse.json({ ok: true, skipped: 'reminder_start_date not set' })
  }

  // 查所有完課但無報告的課程（最近7天內）
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)

  const { data: lessons } = await admin
    .from('lessons')
    .select(`
      id, date, time, duration, status, report_reminder_sent,
      teacher:teachers!teacher_id ( id, teacher_name, email ),
      student:students!student_id ( en_name, zh_name ),
      report:lesson_reports!lesson_id ( id )
    `)
    .eq('is_active', true)
    .eq('status', 'completed')
    .gte('date', reminderStartDate)
    .lt('report_reminder_sent', 3)

  if (!lessons || lessons.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let sent12h = 0, sent20h = 0, marked24h = 0

  for (const lesson of lessons) {
    // 已有報告就跳過
    const hasReport = Array.isArray(lesson.report)
      ? lesson.report.length > 0
      : !!lesson.report
    if (hasReport) continue

    const teacher = Array.isArray(lesson.teacher) ? lesson.teacher[0] : lesson.teacher
    const student = Array.isArray(lesson.student) ? lesson.student[0] : lesson.student
    if (!teacher?.email) continue

    // 計算距離完課多少小時
    const lessonDateTime = new Date(`${lesson.date}T${lesson.time ?? '00:00:00'}`)
    const hoursElapsed = (now.getTime() - lessonDateTime.getTime()) / (1000 * 60 * 60)

    const reminderSent = lesson.report_reminder_sent ?? 0
    const studentName = (student as any)?.en_name ?? (student as any)?.zh_name ?? 'your student'
    const teacherEmail = (teacher as any)?.email
    const teacherName = (teacher as any)?.teacher_name ?? 'Teacher'

    if (hoursElapsed >= 24 && reminderSent < 3) {
      // 24h：標記 pending，不再發信
      await admin
        .from('lessons')
        .update({ report_reminder_sent: 3 })
        .eq('id', lesson.id)
      marked24h++

    } else if (hoursElapsed >= 20 && reminderSent < 2) {
      // 20h：第二封提醒
      await resend.emails.send({
        from: 'Bridgeway Classroom <classroom@bridgewayenglish.net>',
        to: teacherEmail,
        subject: `⚠️ Final reminder: Report for ${studentName} on ${lesson.date}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
              Bridgeway <span style="color: #b8973a;">Teacher Portal</span>
            </div>
            <p style="font-size: 15px; color: #1a2236; margin-bottom: 16px;">
              Hi ${teacherName},
            </p>
            <p style="font-size: 14px; color: #1a2236; margin-bottom: 16px;">
              This is a final reminder. Your lesson report for <strong>${studentName}</strong> on <strong>${lesson.date}</strong> is still missing.
            </p>
            <div style="background: #FEF3C7; border-left: 3px solid #F59E0B; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="font-size: 13px; color: #92400E; margin: 0;">
                ⚠️ If the report is not submitted within 4 hours, this lesson will be marked as <strong>pending</strong> and may not be counted for this pay period.
              </p>
            </div>
            <a href="https://teacher.bridgewayenglish.net/lessons"
               style="display: inline-block; background: #b8973a; color: #1a2236; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px;">
              Submit Report Now
            </a>
            <p style="font-size: 12px; color: #9a9080; margin-top: 24px;">
              Bridgeway English · Teacher Portal
            </p>
          </div>
        `,
      })
      await admin
        .from('lessons')
        .update({ report_reminder_sent: 2 })
        .eq('id', lesson.id)
      sent20h++

    } else if (hoursElapsed >= 12 && reminderSent < 1) {
      // 12h：第一封提醒
      await resend.emails.send({
        from: 'Bridgeway Classroom <classroom@bridgewayenglish.net>',
        to: teacherEmail,
        subject: `Reminder: Report for ${studentName} on ${lesson.date}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
              Bridgeway <span style="color: #b8973a;">Teacher Portal</span>
            </div>
            <p style="font-size: 15px; color: #1a2236; margin-bottom: 16px;">
              Hi ${teacherName},
            </p>
            <p style="font-size: 14px; color: #1a2236; margin-bottom: 16px;">
              Just a friendly reminder that the lesson report for <strong>${studentName}</strong> on <strong>${lesson.date}</strong> hasn't been submitted yet.
            </p>
            <p style="font-size: 14px; color: #1a2236; margin-bottom: 16px;">
              Please submit the report as soon as possible so your student can review their progress.
            </p>
            <a href="https://teacher.bridgewayenglish.net/lessons"
               style="display: inline-block; background: #b8973a; color: #1a2236; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px;">
              Submit Report
            </a>
            <p style="font-size: 12px; color: #9a9080; margin-top: 24px;">
              Bridgeway English · Teacher Portal
            </p>
          </div>
        `,
      })
      await admin
        .from('lessons')
        .update({ report_reminder_sent: 1 })
        .eq('id', lesson.id)
      sent12h++
    }
  }

  return NextResponse.json({
    ok: true,
    sent12h,
    sent20h,
    marked24h,
    checkedAt: now.toISOString(),
  })
}
