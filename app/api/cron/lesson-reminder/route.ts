import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  // 查 reminder_start_date
  const { data: meta } = await admin
    .from('app_meta')
    .select('reminder_start_date')
    .eq('id', 1)
    .single()

  const reminderStartDate = meta?.reminder_start_date ?? null
  if (!reminderStartDate) {
    return NextResponse.json({ ok: true, skipped: 'reminder_start_date not set' })
  }

  // 查未來48小時內的 scheduled 課程
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const todayStr = now.toISOString().slice(0, 10)
  const in48hStr = in48h.toISOString().slice(0, 10)

  const { data: lessons } = await admin
    .from('lessons')
    .select(`
      id, date, time, duration, class_type,
      reminder_24h_sent, reminder_1h_sent,
      teacher:teachers!teacher_id ( id, teacher_name, email, zoom_url ),
      student:students!student_id ( en_name, zh_name, zoom_email )
    `)
    .eq('is_active', true)
    .eq('status', 'scheduled')
    .gte('date', reminderStartDate)
    .gte('date', todayStr)
    .lte('date', in48hStr)

  if (!lessons || lessons.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let sent24h = 0, sent1h = 0

  for (const lesson of lessons) {
    const teacher = Array.isArray(lesson.teacher) ? lesson.teacher[0] : lesson.teacher
    const student = Array.isArray(lesson.student) ? lesson.student[0] : lesson.student
    if (!teacher || !lesson.time) continue

    const teacherName = (teacher as any).teacher_name ?? 'Teacher'
    const teacherEmail = (teacher as any).email
    const teacherZoom = (teacher as any).zoom_url ?? '（請確認 Zoom 連結）'
    const studentName = (student as any)?.en_name ?? (student as any)?.zh_name ?? 'Student'
    const studentEmail = (student as any)?.zoom_email

    // 計算上課時間
    const lessonDateTime = new Date(`${lesson.date}T${lesson.time}`)
    const hoursUntil = (lessonDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    const durationLabel = lesson.duration === 55 ? '55 分鐘' : '25 分鐘'

    // 改課期限（上課前8小時）
    const deadlineTime = new Date(lessonDateTime.getTime() - 8 * 60 * 60 * 1000)
    const deadlineStr = deadlineTime.toLocaleString('zh-TW', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })

    // 1小時提醒
    if (hoursUntil <= 1 && hoursUntil > 0 && !lesson.reminder_1h_sent) {
      // 老師
      if (teacherEmail) {
        await resend.emails.send({
          from: 'Bridgeway Classroom <classroom@bridgewayenglish.net>',
          to: teacherEmail,
          subject: `⏰ 1 小時後上課：${studentName} · ${lesson.time.slice(0, 5)}`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
              <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
                Bridgeway <span style="color: #b8973a;">Teacher Portal</span>
              </div>
              <p style="font-size: 15px; color: #1a2236;">Hi ${teacherName},</p>
              <p style="font-size: 14px; color: #1a2236;">Your lesson with <strong>${studentName}</strong> starts in <strong>1 hour</strong>.</p>
              <div style="background: #f7f4ee; border-radius: 12px; padding: 16px; margin: 20px 0;">
                <div style="font-size: 13px; color: #6b7b8e;">🕐 ${lesson.time.slice(0, 5)} · ${durationLabel}</div>
                <div style="margin-top: 8px;">
                  <a href="${teacherZoom}" style="color: #b8973a; font-weight: 600; font-size: 14px;">Join Zoom →</a>
                </div>
              </div>
            </div>
          `,
        })
      }
      // 學生
      if (studentEmail) {
        await resend.emails.send({
          from: 'Bridgeway Classroom <classroom@bridgewayenglish.net>',
          to: studentEmail,
          subject: `⏰ 1 小時後上課：${lesson.time.slice(0, 5)} 與 ${teacherName} 老師`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
              <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
                Bridgeway <span style="color: #b8973a;">Classroom</span>
              </div>
              <p style="font-size: 14px; color: #1a2236;">你與 <strong>${teacherName} 老師</strong>的英文課 <strong>1 小時後</strong>開始！</p>
              <div style="background: #f7f4ee; border-radius: 12px; padding: 16px; margin: 20px 0;">
                <div style="font-size: 13px; color: #6b7b8e;">🕐 ${lesson.time.slice(0, 5)} · ${durationLabel}</div>
                <div style="margin-top: 8px;">
                  <a href="${teacherZoom}" style="color: #b8973a; font-weight: 600; font-size: 14px;">進入 Zoom →</a>
                </div>
              </div>
              <p style="font-size: 12px; color: #9a9080;">請確認設備和網路已準備好。</p>
            </div>
          `,
        })
      }
      await admin.from('lessons').update({ reminder_1h_sent: true }).eq('id', lesson.id)
      sent1h++
    }

    // 24小時提醒
    else if (hoursUntil <= 24 && hoursUntil > 1 && !lesson.reminder_24h_sent) {
      const lessonDateLabel = `${lesson.date} ${lesson.time.slice(0, 5)}`

      // 老師
      if (teacherEmail) {
        await resend.emails.send({
          from: 'Bridgeway Classroom <classroom@bridgewayenglish.net>',
          to: teacherEmail,
          subject: `📅 明日上課提醒：${studentName} · ${lessonDateLabel}`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
              <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
                Bridgeway <span style="color: #b8973a;">Teacher Portal</span>
              </div>
              <p style="font-size: 15px; color: #1a2236;">Hi ${teacherName},</p>
              <p style="font-size: 14px; color: #1a2236;">Reminder: you have a lesson tomorrow.</p>
              <div style="background: #f7f4ee; border-radius: 12px; padding: 16px; margin: 20px 0;">
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                  <tr><td style="color: #6b7b8e; padding: 4px 0; width: 100px;">Student</td><td style="color: #1a2236; font-weight: 600;">${studentName}</td></tr>
                  <tr><td style="color: #6b7b8e; padding: 4px 0;">Date & Time</td><td style="color: #1a2236;">${lessonDateLabel}</td></tr>
                  <tr><td style="color: #6b7b8e; padding: 4px 0;">Duration</td><td style="color: #1a2236;">${durationLabel}</td></tr>
                  <tr><td style="color: #6b7b8e; padding: 4px 0;">Zoom</td><td><a href="${teacherZoom}" style="color: #b8973a; font-weight: 600;">${teacherZoom}</a></td></tr>
                </table>
              </div>
              <p style="font-size: 12px; color: #9a9080;">Please prepare your materials and confirm your Zoom link is working.</p>
            </div>
          `,
        })
      }

      // 學生
      if (studentEmail) {
        await resend.emails.send({
          from: 'Bridgeway Classroom <classroom@bridgewayenglish.net>',
          to: studentEmail,
          subject: `📅 明日上課提醒：${lessonDateLabel} 與 ${teacherName} 老師`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
              <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
                Bridgeway <span style="color: #b8973a;">Classroom</span>
              </div>
              <p style="font-size: 14px; color: #1a2236;">你明天有一堂英文課！</p>
              <div style="background: #f7f4ee; border-radius: 12px; padding: 16px; margin: 20px 0;">
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                  <tr><td style="color: #6b7b8e; padding: 4px 0; width: 80px;">老師</td><td style="color: #1a2236; font-weight: 600;">${teacherName}</td></tr>
                  <tr><td style="color: #6b7b8e; padding: 4px 0;">時間</td><td style="color: #1a2236;">${lessonDateLabel}</td></tr>
                  <tr><td style="color: #6b7b8e; padding: 4px 0;">時長</td><td style="color: #1a2236;">${durationLabel}</td></tr>
                  <tr><td style="color: #6b7b8e; padding: 4px 0;">Zoom</td><td><a href="${teacherZoom}" style="color: #b8973a; font-weight: 600;">點此進入課室</a></td></tr>
                </table>
              </div>
              <div style="background: #FEF3C7; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #92400E;">
                ⚠️ 如需改課，請在 ${deadlineStr} 前告知，謝謝。
              </div>
            </div>
          `,
        })
      }

      await admin.from('lessons').update({ reminder_24h_sent: true }).eq('id', lesson.id)
      sent24h++
    }
  }

  return NextResponse.json({ ok: true, sent24h, sent1h, checkedAt: now.toISOString() })
}
