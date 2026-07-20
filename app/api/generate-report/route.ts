import "server-only";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { nanoid } from "nanoid";
import { createAdminClient } from "@/lib/supabase/admin";

// VTT 轉純文字（去掉 WEBVTT 標頭、序號、時間碼）
function vttToPlainText(vtt: string): string {
  return vtt
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t === "WEBVTT") return false;
      if (t === "") return false;
      if (/^\d+$/.test(t)) return false;
      if (/^\d{2}:\d{2}/.test(t)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// 里程碑判斷
function checkMilestone(
  completedCount: number,
  vocabCount: number,
  consecutiveWeeks: number
): string | null {
  if (completedCount === 1) return "完成第一堂課";
  if (completedCount === 10) return "完成第 10 堂課";
  if (completedCount === 25) return "完成第 25 堂課";
  if (completedCount === 50) return "完成第 50 堂課";
  if (vocabCount >= 300) return "學習單字突破 300 個";
  if (vocabCount >= 100) return "學習單字突破 100 個";
  if (consecutiveWeeks >= 12) return "連續上課滿 12 週";
  if (consecutiveWeeks >= 8) return "連續上課滿 8 週";
  if (consecutiveWeeks >= 4) return "連續上課滿 4 週";
  return null;
}

export async function POST(request: Request) {
  // 在 runtime 才初始化（避免 build 時於 module 層級執行、拿不到環境變數）
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const resend = new Resend(process.env.RESEND_API_KEY!);

  try {
    const { lessonId, vttContent, teacherNote, existingReportId, manualInput } =
      await request.json();

    if (!lessonId || (!vttContent && !manualInput)) {
      return NextResponse.json(
        { error: "lessonId 和 vttContent 或 manualInput 為必填" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 查詢課堂資訊
    const { data: lesson } = await admin
      .from("lessons")
      .select(
        `id, date, time, duration, student_id,
         teacher:teachers!teacher_id ( teacher_name )`
      )
      .eq("id", lessonId)
      .single();

    if (!lesson) {
      return NextResponse.json({ error: "找不到課堂" }, { status: 404 });
    }

    // 查詢學生資訊
    const { data: student } = await admin
      .from("students")
      .select("id, en_name, zh_name, zoom_email, learning_goal")
      .eq("id", lesson.student_id)
      .single();

    if (!student) {
      return NextResponse.json({ error: "找不到學生" }, { status: 404 });
    }

    // 查詢最近三堂有報告的歷史（供 Claude 比較）
    const { data: previousReports } = await admin
      .from("lesson_reports")
      .select(`analysis_zh, errors, strengths, lesson:lesson_id ( date )`)
      .eq("student_id", student.id)
      .not("analysis_zh", "is", null)
      .order("created_at", { ascending: false })
      .limit(3);

    // 查詢已完成堂數（里程碑判斷）
    const { count: completedCount } = await admin
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .eq("status", "completed")
      .eq("is_active", true);

    // 查詢已收藏單字數（里程碑判斷）
    const { count: vocabCount } = await admin
      .from("saved_vocabulary")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id);

    const studentName = student.en_name ?? student.zh_name;
    // untyped admin client 對 embed 會解析為 never，存取時轉 any
    const teacherRel = lesson.teacher as any;
    const teacherName =
      (Array.isArray(teacherRel)
        ? teacherRel[0]?.teacher_name
        : teacherRel?.teacher_name) ?? "老師";

    const transcript = vttContent
    ? vttToPlainText(vttContent)
    : `[手動填寫模式 - 無錄音檔]
學生課堂表現：${manualInput?.performance || ""}
本課重點單字：${manualInput?.vocabulary || "（老師未填）"}
本課重點片語：${manualInput?.phrases || "（老師未填）"}
需要加強的地方：${manualInput?.errors || "（老師未填）"}
下堂課建議：${manualInput?.nextFocus || "（老師未填）"}`;

    const previousSummary = (previousReports ?? []).map((r: any) => ({
      date: Array.isArray(r.lesson) ? r.lesson[0]?.date : r.lesson?.date,
      errors: r.errors,
      strengths: r.strengths,
    }));

    const prompt = `你是 Bridgeway English 的 AI 學習分析師。
分析以下英文課堂的轉錄稿，生成一份學習報告。

學生姓名：${studentName}
老師姓名：${teacherName}
上課日期：${lesson.date}
學習目標：${student.learning_goal ?? "未設定"}

${teacherNote ? `老師手記：${teacherNote}` : ""}

過去三堂課摘要（供比較）：
${JSON.stringify(previousSummary, null, 2)}

本堂課轉錄稿：
${transcript}

報告規則：
- 像一位關心學生的老師在說話，有溫度、具體、鼓勵性
- 中文版：輕鬆親切，重點放在鼓勵和具體建議
- 英文版：全英文，語氣正式但友善，可作為學習材料
- 禁止使用 emoji
- 禁止空泛稱讚（如「你表現很好」），只說具體觀察
- 單字和片語只抓「學生明顯不熟悉、或老師特別解釋過」的詞彙，最多 8 個單字、6 個片語
- 錯誤模式要列出「所有」發生的例句，不只是代表性的一句
- errors 的 pattern 必須同時提供 pattern_zh（中文名稱）和 pattern_en（英文名稱）
- examples 欄位是陣列，列出課堂中所有出現的錯誤例句（只能是英文），每個錯誤都要有對應的 correction
- reflection_question 必須是語言輸出練習（造句、口說、寫作），絕對不能問課文情節
- vocabulary 最少 6 個、最多 10 個；phrases 最少 4 個、最多 8 個

嚴格輸出以下 JSON 格式，不加任何其他文字、不加 markdown：

{
  "vocabulary": [
    {
      "word": "actually",
      "type": "word",
      "definition_zh": "實際上、事實上",
      "definition_en": "used to emphasize what is really true"
    }
  ],
  "phrases": [
    {
      "phrase": "I think it depends on…",
      "type": "phrase",
      "usage_zh": "表達不確定或視情況而定時使用",
      "usage_en": "used when the answer varies by situation"
    }
  ],
  "strengths": [
    {
      "zh": "主動提問 4 次，比上堂課多了 2 次",
      "en": "Asked 4 questions proactively, 2 more than last lesson"
    }
  ],
  "errors": [
    {
      "pattern": "past tense",
      "count": 3,
      "example": "I go to school yesterday",
      "correction": "I went to school yesterday",
      "tip_zh": "過去式動詞要用 went，不是 go",
      "tip_en": "Use 'went' for past tense, not 'go'"
    }
  ],
  "comparison": {
    "summary_zh": "這堂課你的文法錯誤比上堂課減少了 2 次，主動提問增加了 2 次。",
    "summary_en": "You made 2 fewer grammar errors and asked 2 more questions than last lesson."
  },
  "analysis_zh": {
    "headline": "Annie，你這堂課真的有進步。",
    "body": "具體、有溫度的中文分析，2-4句。"
  },
  "analysis_en": {
    "headline": "Annie, you made real progress today.",
    "body": "Specific, warm English analysis, 2-4 sentences."
  },
  "next_focus": "Next lesson focus written in English only — specific teaching suggestions for the next session",
  "reflection_question": {
    "zh": "針對本課學習點的語言輸出練習題（用中文說明）。必須是造句、口說或寫作練習，例如：用今天學的單字造一個關於自己生活的句子，或用英文寫3句描述最近做的事（用過去式）。禁止問課文情節或故事內容。",
    "en": "A language output practice prompt directly tied to today's learning point. Must be a speaking or writing exercise, e.g. use a vocabulary word in a sentence about your own life, or write 3 sentences about something you did recently using past tense. Do NOT ask about the story plot or characters."
  }
}`;

    // Claude API 呼叫
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Claude 回傳格式錯誤");
    }

    // 解析 JSON（處理可能的 markdown 包裝）
    const jsonText = block.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const report = JSON.parse(jsonText);

    // 里程碑判斷（連續週數 Sprint 3 才完整實作，先用 0）
    const milestone = checkMilestone(
      completedCount ?? 0,
      vocabCount ?? 0,
      0
    );

    // 報告欄位（insert / update 共用）
    const reportFields = {
      transcript_vtt: vttContent,
      teacher_note: teacherNote ?? null,
      analysis_zh: report.analysis_zh,
      analysis_en: report.analysis_en,
      vocabulary: report.vocabulary,
      phrases: report.phrases,
      strengths: report.strengths,
      errors: report.errors,
      comparison: report.comparison,
      next_focus: report.next_focus,
      milestone,
    };

    let reportId: string;

    if (existingReportId) {
      // 重新生成：就地更新同一份報告（保留 report id，學生的收藏 / 作答不受影響）
      reportId = existingReportId;
      const { error: updateError } = await admin
        .from("lesson_reports")
        .update({ ...reportFields, updated_at: new Date().toISOString() })
        .eq("id", existingReportId);

      if (updateError) {
        throw new Error(`更新失敗：${updateError.message}`);
      }

      // 只更新思考題題目，保留學生已寫的 response
      if (report.reflection_question) {
        await admin
          .from("reflection_responses")
          .update({
            question_zh: report.reflection_question.zh,
            question_en: report.reflection_question.en,
          })
          .eq("lesson_report_id", existingReportId);
      }
    } else {
      // 首次生成：INSERT
      reportId = `lr_${nanoid(12)}`;
      const { error: insertError } = await admin.from("lesson_reports").insert({
        id: reportId,
        lesson_id: lessonId,
        student_id: student.id,
        ...reportFields,
      });

      if (insertError) {
        throw new Error(`寫入失敗：${insertError.message}`);
      }

      // 預建思考題記錄（讓學生可以填答）
      if (report.reflection_question) {
        await admin.from("reflection_responses").insert({
          id: `rr_${nanoid(12)}`,
          student_id: student.id,
          lesson_report_id: reportId,
          question_zh: report.reflection_question.zh,
          question_en: report.reflection_question.en,
          response: null,
        });
      }
    }

    // 發送 Email 通知
    if (student.zoom_email) {
      await resend.emails.send({
        from: "Bridgeway Classroom <classroom@bridgewayenglish.net>",
        to: student.zoom_email,
        subject: `${studentName}，你的 ${lesson.date} 課堂學習報告出來了`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="font-size: 18px; font-weight: 500; color: #1a2236; margin-bottom: 24px;">
              Bridgeway <span style="color: #b8973a;">Classroom</span>
            </div>
            <p style="font-size: 15px; color: #1a2236; margin-bottom: 8px;">
              ${teacherName} 老師分析了你這堂課的表現。
            </p>
            ${
              report.strengths?.[0]
                ? `
            <div style="background: #f7f4ee; border-left: 3px solid #b8973a; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #9a9080; margin-bottom: 6px;">這堂課你做得最好的一件事</div>
              <div style="font-size: 14px; color: #1a2236;">${report.strengths[0].zh}</div>
            </div>
            `
                : ""
            }
            <a href="https://app.bridgewayenglish.net/report/${lessonId}"
               style="display: inline-block; background: #b8973a; color: #1a2236; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px;">
              查看完整學習報告
            </a>
            <p style="font-size: 12px; color: #9a9080; margin-top: 24px;">
              Bridgeway English · app.bridgewayenglish.net
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true, reportId });
  } catch (error) {
    console.error("generate-report error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "發生未知錯誤" },
      { status: 500 }
    );
  }
}
