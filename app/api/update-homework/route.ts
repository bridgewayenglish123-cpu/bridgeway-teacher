import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_TRANSLATE = 5; // 同一份 homework 最多翻譯次數(防濫用,正常老師碰不到)

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reportId, homeworkEn } = await req.json()
  if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 })

  const admin = createAdminClient()

  // 讀現有 homework + 翻譯次數
  const { data: current } = await admin
    .from('lesson_reports')
    .select('homework, homework_translate_count')
    .eq('id', reportId)
    .single()

  const currentHomework = (current?.homework ?? null) as { en?: string; zh?: string } | null
  const currentEn = currentHomework?.en?.trim() ?? ''
  const translateCount = current?.homework_translate_count ?? 0

  // homework 清空:直接存 null(不算翻譯)
  if (!homeworkEn || !String(homeworkEn).trim()) {
    const { error } = await admin.from('lesson_reports').update({ homework: null }).eq('id', reportId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, homework: null })
  }

  const en = String(homeworkEn).trim()

  // ── A. 內容沒變:不翻譯,直接返回(不消耗 API,不增加次數) ──
  if (en === currentEn) {
    return NextResponse.json({ ok: true, homework: currentHomework, unchanged: true })
  }

  // ── B. 達上限:完全鎖死,拒絕任何修改(en/zh 都不能改) ──
  if (translateCount >= MAX_TRANSLATE) {
    return NextResponse.json({
      error: `此作業已達修改上限(${MAX_TRANSLATE} 次),無法再修改。`,
      locked: true,
    }, { status: 403 })
  }

  // ── 內容有變且未達上限:翻譯 ──
  let zh: string | null = null
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `把以下英文回家作業翻譯成繁體中文。只翻譯,不改寫、不優化、不增減內容,保留原意與格式。只回傳中文翻譯,不要加任何說明。\n\n英文原文:\n${en}`
      }],
    });
    const block = msg.content[0];
    if (block && block.type === "text") zh = block.text.trim();
  } catch {
    zh = null;
  }

  const { error } = await admin
    .from('lesson_reports')
    .update({ homework: { en, zh }, homework_translate_count: translateCount + 1 })
    .eq('id', reportId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    homework: { en, zh },
    translateCount: translateCount + 1,
    remaining: MAX_TRANSLATE - (translateCount + 1),
  })
}
