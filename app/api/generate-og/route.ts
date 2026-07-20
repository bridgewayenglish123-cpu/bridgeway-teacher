import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { lessonId, template = 'lesson' } = await req.json();
  if (!lessonId) return NextResponse.json({ error: "lessonId required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: lesson } = await admin
    .from('lessons')
    .select('id, date, student_id, student:students!student_id(en_name, zh_name), teacher:teachers!teacher_id(teacher_name)')
    .eq('id', lessonId)
    .single();

  const { data: report } = await admin
    .from('lesson_reports')
    .select('vocabulary, phrases')
    .eq('lesson_id', lessonId)
    .single();

  const student = Array.isArray(lesson?.student) ? (lesson.student as any[])[0] : lesson?.student as any;
  const teacher = Array.isArray(lesson?.teacher) ? (lesson.teacher as any[])[0] : lesson?.teacher as any;
  const vocab = (report?.vocabulary as any[]) ?? [];
  const phrases = (report?.phrases as any[]) ?? [];

  const studentName = student?.en_name ?? student?.zh_name ?? 'Student';
  const teacherName = teacher?.teacher_name ?? '';
  const date = lesson?.date ?? '';
  const vocabCount = vocab.length;
  const phraseCount = phrases.length;
  const dateFormatted = date ? date.slice(5).replace('-', '.') : '';
  const previewWords = vocab.slice(0, 4).map((v: any) => v.word).filter(Boolean);
  const extraWords = Math.max(0, vocabCount - 4);

  const lessonTagline = vocabCount > phraseCount * 2
    ? 'Heavy on vocabulary today.'
    : phraseCount > vocabCount * 2
      ? 'Phrases were the focus today.'
      : 'Words and phrases, all covered.';

  const lessonPersonal = vocabCount >= 8
    ? `${studentName} is building a serious vocabulary.`
    : phraseCount >= 6
      ? `${studentName} speaks more naturally every lesson.`
      : `${studentName} is getting better every time.`;

  const { createCanvas } = await import('canvas');
  const W = 1200, H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const navy = '#1A2236';
  const gold = '#B8973A';
  const ivory = '#F7F4EE';

  ctx.fillStyle = ivory; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = gold; ctx.fillRect(0, 0, W, 5);
  ctx.strokeStyle = 'rgba(26,34,54,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(820, 40); ctx.lineTo(820, H-52); ctx.stroke();

  if (template === 'milestone') {
    const { count: cc } = await admin.from('lessons').select('id', { count: 'exact', head: true })
      .eq('student_id', lesson?.student_id ?? '').eq('status', 'completed').eq('is_active', true);
    const completedCount = cc ?? 0;

    const { count: tv } = await admin.from('saved_vocabulary').select('id', { count: 'exact', head: true })
      .eq('student_id', lesson?.student_id ?? '');
    const totalVocab = tv ?? 0;

    const { data: recentLessons } = await admin.from('lessons').select('date')
      .eq('student_id', lesson?.student_id ?? '').eq('status', 'completed').eq('is_active', true)
      .order('date', { ascending: false }).limit(52);

    let streakWeeks = 0;
    if (recentLessons && recentLessons.length > 0) {
      const weeks = new Set(recentLessons.map((l: any) => {
        const d = new Date(l.date + 'T00:00:00');
        const s = new Date(d); s.setDate(d.getDate() - d.getDay());
        return s.toISOString().slice(0, 10);
      }));
      const sorted = Array.from(weeks).sort().reverse();
      const now = new Date();
      const thisWeek = new Date(now); thisWeek.setDate(now.getDate() - now.getDay());
      const thisWeekStr = thisWeek.toISOString().slice(0, 10);
      const lastWeek = new Date(thisWeek); lastWeek.setDate(thisWeek.getDate() - 7);
      if (sorted[0] === thisWeekStr || sorted[0] === lastWeek.toISOString().slice(0, 10)) {
        for (let i = 0; i < sorted.length; i++) {
          const exp = new Date(thisWeek); exp.setDate(thisWeek.getDate() - i * 7);
          if (sorted[i] === exp.toISOString().slice(0, 10)) streakWeeks++;
          else break;
        }
      }
    }

    const milestoneTagline = completedCount <= 5 ? 'Just getting started.'
      : completedCount <= 10 ? 'Building momentum.'
      : completedCount <= 20 ? 'Still going.'
      : completedCount <= 30 ? 'Consistency is everything.'
      : 'This is dedication.';

    const words = milestoneTagline.split(' ');
    const mid = Math.ceil(words.length / 2);
    const line1 = words.slice(0, mid).join(' ');
    const line2 = words.slice(mid).join(' ');

    ctx.fillStyle = navy; ctx.globalAlpha = 0.55; ctx.font = 'bold 18px Arial';
    ctx.fillText('BRIDGEWAY · CLASSROOM', 64, 78); ctx.globalAlpha = 1;
    ctx.fillStyle = gold; ctx.font = 'bold 16px Arial';
    ctx.fillText('LEARNING MILESTONE', 64, 116);

    ctx.fillStyle = navy; ctx.font = 'bold 240px Arial';
    ctx.fillText(String(completedCount), 64, 430);

    const TX = 310;
    ctx.fillStyle = navy; ctx.globalAlpha = 0.7; ctx.font = 'bold 17px Arial';
    ctx.fillText('堂課完成', TX, 252); ctx.globalAlpha = 1;
    ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(TX, 268); ctx.lineTo(750, 268); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = gold; ctx.font = 'bold 34px Arial';
    ctx.fillText(line1, TX, 312);
    if (line2) ctx.fillText(line2, TX, 354);
    ctx.strokeStyle = 'rgba(26,34,54,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TX, 372); ctx.lineTo(750, 372); ctx.stroke();
    ctx.fillStyle = navy; ctx.globalAlpha = 0.55; ctx.font = '20px Arial';
    ctx.fillText(`${studentName} doesn't quit.`, TX, 410); ctx.globalAlpha = 1;

    ctx.fillStyle = gold; ctx.font = 'bold 16px Arial';
    ctx.fillText('YOUR PROGRESS', 856, 78);

    ctx.fillStyle = navy; ctx.font = 'bold 36px Arial';
    ctx.fillText(teacherName || 'Bridgeway', 856, 190);
    ctx.fillStyle = navy; ctx.globalAlpha = 0.55; ctx.font = 'bold 16px Arial';
    ctx.fillText('授課老師', 856, 216); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(26,34,54,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(856, 232); ctx.lineTo(1160, 232); ctx.stroke();

    ctx.fillStyle = gold; ctx.font = 'bold 100px Arial';
    ctx.fillText(String(totalVocab), 856, 390);
    ctx.fillStyle = navy; ctx.globalAlpha = 0.6; ctx.font = 'bold 16px Arial';
    ctx.fillText('累計學習詞彙', 856, 414); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(26,34,54,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(856, 430); ctx.lineTo(1160, 430); ctx.stroke();

    ctx.fillStyle = navy; ctx.font = 'bold 100px Arial';
    ctx.fillText(String(streakWeeks), 856, 538);
    ctx.fillStyle = navy; ctx.globalAlpha = 0.6; ctx.font = 'bold 16px Arial';
    ctx.fillText('連續學習週數', 856, 562); ctx.globalAlpha = 1;

  } else {
    ctx.fillStyle = navy; ctx.globalAlpha = 0.55; ctx.font = 'bold 18px Arial';
    ctx.fillText('BRIDGEWAY · CLASSROOM', 64, 78);
    ctx.globalAlpha = 0.3; ctx.font = '16px Arial';
    ctx.fillText(`${dateFormatted}${teacherName ? ' · ' + teacherName : ''}`, 570, 78);
    ctx.globalAlpha = 1;
    ctx.fillStyle = gold; ctx.font = 'bold 16px Arial';
    ctx.fillText("TODAY'S LESSON", 64, 116);

    const NUM_Y = 385;
    ctx.fillStyle = navy; ctx.font = 'bold 220px Arial';
    ctx.fillText(String(vocabCount), 64, NUM_Y);
    ctx.fillStyle = navy; ctx.globalAlpha = 0.1; ctx.font = '44px Arial';
    ctx.fillText('+', 318, NUM_Y - 82); ctx.globalAlpha = 1;
    ctx.fillStyle = gold; ctx.font = 'bold 220px Arial';
    ctx.fillText(String(phraseCount), 388, NUM_Y);

    ctx.fillStyle = navy; ctx.globalAlpha = 0.45; ctx.font = 'bold 17px Arial';
    ctx.fillText('單字', 136, NUM_Y + 34);
    ctx.fillText('片語', 456, NUM_Y + 34); ctx.globalAlpha = 1;

    const DIV_Y = NUM_Y + 58;
    ctx.strokeStyle = 'rgba(26,34,54,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(64, DIV_Y); ctx.lineTo(760, DIV_Y); ctx.stroke();

    const TAG_Y = DIV_Y + 32;
    ctx.fillStyle = gold; ctx.font = 'bold 26px Arial';
    ctx.fillText(lessonTagline, 64, TAG_Y);
    ctx.fillStyle = navy; ctx.globalAlpha = 0.5; ctx.font = '18px Arial';
    ctx.fillText(lessonPersonal, 64, TAG_Y + 30); ctx.globalAlpha = 1;

    ctx.fillStyle = gold; ctx.font = 'bold 16px Arial';
    ctx.fillText('NEW VOCABULARY', 856, 78);

    const WORD_START = 116, WORD_SLOT = 104;
    previewWords.forEach((w: string, i: number) => {
      const y = WORD_START + i * WORD_SLOT + 70;
      ctx.fillStyle = navy; ctx.globalAlpha = 0.78;
      ctx.font = 'bold 34px Arial';
      ctx.fillText(w, 856, y); ctx.globalAlpha = 1;
      if (i < previewWords.length - 1) {
        ctx.strokeStyle = 'rgba(26,34,54,0.07)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(856, y + 16); ctx.lineTo(1160, y + 16); ctx.stroke();
      }
    });
    if (extraWords > 0) {
      const lastY = WORD_START + (previewWords.length - 1) * WORD_SLOT + 70;
      ctx.fillStyle = gold; ctx.globalAlpha = 0.65; ctx.font = 'bold 16px Arial';
      ctx.fillText(`+${extraWords} more`, 856, lastY + 36); ctx.globalAlpha = 1;
    }
  }

  ctx.strokeStyle = 'rgba(26,34,54,0.06)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H-52); ctx.lineTo(W, H-52); ctx.stroke();
  ctx.fillStyle = navy; ctx.font = 'bold 22px Arial';
  ctx.fillText(studentName, 64, H-18);
  ctx.fillStyle = navy; ctx.globalAlpha = 0.18; ctx.font = '13px Arial';
  ctx.fillText('app.bridgewayenglish.net', 950, H-18); ctx.globalAlpha = 1;

  const png = canvas.toBuffer('image/png');
  const storagePath = `${lessonId}-${template}.png`;
  const { error } = await admin.storage
    .from('og-images')
    .upload(storagePath, png, { contentType: 'image/png', upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from('og-images').getPublicUrl(storagePath);
  return NextResponse.json({ url: publicUrl });
}
