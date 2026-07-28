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
    const { lessonId, vttContent, teacherNote, existingReportId, manualInput, confirmedVocab } =
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
    // 只抓「當前這堂之前」且日期更早的報告作比較基準。
    // 兩個關鍵過濾:
    // 1) 排除 existingReportId(regenerate 時避免把這堂自己的舊版當成前一堂)
    // 2) lesson.date < 本堂日期(確保是真正的「過去」,不是同日或未來)
    const { data: previousReports } = await admin
      .from("lesson_reports")
      .select(`analysis_zh, errors, strengths, lesson:lesson_id ( date )`)
      .eq("student_id", student.id)
      .not("analysis_zh", "is", null)
      .neq("id", existingReportId ?? "___none___")
      .order("created_at", { ascending: false })
      .limit(5);

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
    const studentLevel = (student as any).level ?? 'Elementary';
    const learnerType = (student as any).learner_type ?? 'Adult';
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

    const previousSummary = (previousReports ?? [])
      .map((r: any) => ({
        date: Array.isArray(r.lesson) ? r.lesson[0]?.date : r.lesson?.date,
        errors: r.errors,
        strengths: r.strengths,
      }))
      // 只保留日期「嚴格早於」本堂的報告 —— 這才是真正可比較的前幾堂
      .filter((r: any) => r.date && r.date < lesson.date)
      .slice(0, 3);

    // 是否真的有前一堂可比較。沒有就不讓 AI 生成 comparison(避免無中生有)。
    const hasPrevious = previousSummary.length > 0;

    const prompt = `你是 Bridgeway English 的 AI 學習分析師。
分析以下英文課堂的轉錄稿，生成一份學習報告。

學生姓名：${studentName}
學生程度：${studentLevel}（Beginner / Elementary / Intermediate / Upper-Intermediate）
學生類型：${learnerType}（Young Learner / Junior / Adult）

【語氣風格】統一採用：鼓勵 + 幽默混合。像一個真心關心學生的老師，偶爾說個俏皮的話，但永遠讓學生感覺被支持。
依學生類型調整：
- Young Learner：誇張可愛的鼓勵，用最簡單的詞，像在跟小朋友說話
- Junior：酷一點、有個性，不過度甜膩，適當挑戰
- Adult：專業但溫暖，點到為止不囉嗦

【例句生成規則】例句必須同時滿足兩個獨立維度，不可互相取代：

維度一 — 句型難度（依 level）：
- Beginner：6-8 字，單一子句，現在式為主
- Elementary：8-12 字，可用簡單連接詞（and / but / because）
- Pre-Intermediate：12-16 字，複合句、基本時態變化
- Intermediate：16-20 字，可含從屬子句、多種時態
- Upper-Intermediate：20 字以上，慣用語、抽象語境、較複雜句構

維度二 — 語境題材（依 learner_type）：
- Young Learner：學校、家庭、動物、遊戲、食物，第一人稱，具體可想像
- Junior：朋友、社群媒體、興趣、校園生活，帶點個性與真實感
- Adult：職場、旅行、日常決策、人際溝通，實用導向

重要：兩個維度獨立生效。Upper-Intermediate 的 Young Learner 應該得到「句型複雜但題材童趣」的例句，不是成人語境的例句；Beginner 的 Adult 應該得到「句型簡單但題材成熟」的例句。

同時請從逐字稿判斷學生實際表現，若實際程度與設定不符，以逐字稿為準微調難度。

【錯誤呈現】不要直接給答案，用問句方式呈現：
例：「你今天說了 'I go to school yesterday'——你知道哪裡怪怪的嗎？」
然後在 correction 欄位給正確版本（前端會做展開效果，讓學生先想再看）。

【hidden_gem】依學生類型：
- Young Learner：一定要有，超具體，讓小朋友感覺被老師看見
- Junior：要有，用比較酷的語氣描述
- Adult：有真正值得說的再放，沒有就 null
老師姓名：${teacherName}
上課日期：${lesson.date}
學習目標：${student.learning_goal ?? "未設定"}

${teacherNote ? `老師手記：${teacherNote}` : ""}

${hasPrevious
  ? `過去幾堂課摘要（供比較）：\n${JSON.stringify(previousSummary, null, 2)}`
  : "【這位學生目前沒有任何過去的課程報告可供比較 —— 可能是首次生成報告，或先前課程未產生報告】"}

本堂課轉錄稿：
${transcript}

報告規則：
${hasPrevious
  ? "- comparison 欄位:根據上方提供的過去課程摘要,做真實的比較(進步、退步、持平都據實說)。只能引用摘要中真實存在的資料,不可捏造上堂課的句子或數字。"
  : "- 【鐵則】目前沒有任何過去的報告紀錄可比較。comparison 欄位必須為 null。strengths、errors、任何欄位都「絕對禁止」出現『比上堂課』『上週』『比上次』這類與過去比較的措辭,因為沒有可對照的過去資料。只描述這一堂課本身觀察到的表現。"}
- 像一位關心學生的老師在說話，有溫度、具體、鼓勵性
- 中文版：輕鬆親切，重點放在鼓勵和具體建議
- 英文版：全英文，語氣正式但友善，可作為學習材料
- 禁止使用 emoji
- 禁止空泛稱讚（如「你表現很好」），只說具體觀察
${confirmedVocab ? `- 【最高優先·詞彙鎖定】vocabulary 陣列必須「完全等於」以下老師指定的單字，一字不多一字不少，順序可自訂但內容不可增刪替換：${(confirmedVocab.words || []).join(", ") || "（無）"}。phrases 陣列必須「完全等於」以下老師指定的片語：${(confirmedVocab.phrases || []).join(", ") || "（無）"}。這是硬性規定，即使你認為課堂有其他重要詞彙，也絕對不可自行加入或移除。你的工作只是為這些指定詞彙生成定義與例句，不是重新挑選詞彙。` : "- 單字和片語：只抓老師特別解釋過、學生問過、或課堂重點強調的詞彙，不設數量上限"}
${confirmedVocab && ((confirmedVocab.forcedWords || []).length > 0 || (confirmedVocab.forcedPhrases || []).length > 0) ? `- 【拼寫存疑字】以下詞彙拼寫檢查查無結果，但老師仍堅持加入：${[...(confirmedVocab.forcedWords || []), ...(confirmedVocab.forcedPhrases || [])].join(", ")}。請對這些字特別謹慎：先判斷它是否為有效英文（可能是專有名詞、品牌、新詞、專業術語，這些都正常處理即可）；若判斷後確定無法辨識、可能是拼寫錯誤，definition_zh 與 definition_en 請誠實寫「此字可能拼寫有誤，建議老師確認」，example_en/example_zh 留簡短提示即可，切勿憑空編造定義或造句。` : ""}
- 錯誤模式要列出「所有」發生的例句，不只是代表性的一句
- errors 的 pattern 必須同時提供 pattern_zh（中文名稱）和 pattern_en（英文名稱）
- errors 每一項用 examples 陣列（不是單數 example），列出課堂中所有出現的錯誤例句（只能是英文）
- examples 陣列裡每個物件的鍵名固定為 original（錯誤原句）和 correction（正確版本），不可用其他鍵名
- reflection_question 必須是語言輸出練習（造句、口說、寫作），絕對不能問課文情節
${confirmedVocab ? "" : "- vocabulary 與 phrases 合計最多 20 個；其中 vocabulary 至少 6 個、phrases 至少 3 個"}

嚴格輸出以下 JSON 格式，不加任何其他文字、不加 markdown：

{
  "vocabulary": [
    {
      "word": "actually",
      "type": "word",
      "definition_zh": "實際上、事實上",
      "definition_en": "used to emphasize what is really true",
      "example_en": "I thought it would be boring, but it was actually really fun.",
      "example_zh": "我以為會很無聊，但其實真的很有趣。"
    }
  ],
  "phrases": [
    {
      "phrase": "I think it depends on…",
      "type": "phrase",
      "usage_zh": "表達不確定或視情況而定時使用",
      "usage_en": "used when the answer varies by situation",
      "example_en": "I think it depends on how much time you have.",
      "example_zh": "我覺得要看你有多少時間而定。"
    }
  ],
  "strengths": [
    {
      "zh": "主動提問 4 次，並用問題來釐清語意",
      "en": "Asked 4 questions proactively and used them to clarify meaning"
    }
  ],
  "errors": [
    {
      "pattern": "past tense",
      "pattern_zh": "過去式動詞使用錯誤",
      "pattern_en": "Incorrect Past Tense",
      "count": 3,
      "examples": [
        { "original": "I go to school yesterday", "correction": "I went to school yesterday" }
      ],
      "tip_zh": "過去式動詞要用 went，不是 go",
      "tip_en": "Use 'went' for past tense, not 'go'"
    }
  ],
  "comparison": {
    "_note": "若沒有過去的報告可比較,整個 comparison 必須是 null,不要填物件",
    "summary_zh": "這堂課你的文法錯誤比上堂課減少了 2 次，主動提問增加了 2 次。",
    "summary_en": "You made 2 fewer grammar errors and asked 2 more questions than last lesson."
  },
  "hidden_gem": "A specific moment from today's lesson that the student might not have noticed — something genuinely impressive or meaningful. Write in warm, story-like Chinese (2-3 sentences). IMPORTANT: Only include this if there is a truly remarkable moment worth highlighting. If nothing stands out, return null.",
  "next_challenge": "A specific, personal challenge for the student to try before next lesson. NOT course content — a language challenge targeting their specific weakness. Write in Chinese, 1-2 sentences, with a hint of excitement. Example: '下次試試看：當你想說「因為」的時候，你能不能不用 because？看你能想出幾種說法。' Adjust difficulty and tone based on learner_type.",
  "parent_summary": "ONLY include if learner_type is 'Young Learner'. A warm, informative summary for parents (2-3 sentences in Traditional Chinese). Cover: what the child learned today, one specific moment of progress the parent would be proud of, and one thing to encourage at home. If learner_type is NOT 'Young Learner', return null.",
  "analysis_zh": {
    "headline": "Annie，你這堂課真的有進步。",
    "body": "具體、有溫度的中文分析，2-4句。"
  },
  "analysis_en": {
    "headline": "Annie, you made real progress today.",
    "body": "Specific, warm English analysis, 2-4 sentences."
  },
  "next_focus": "2-4 specific teaching recommendations based on what this student needs most. Written in English. Each recommendation on its own line, no numbering, no bullet points.",
  "reflection_question": {
    "zh": "針對本課學習點的語言輸出練習題（用中文說明）。必須是造句、口說或寫作練習，例如：用今天學的單字造一個關於自己生活的句子，或用英文寫3句描述最近做的事（用過去式）。禁止問課文情節或故事內容。",
    "en": "A language output practice prompt directly tied to today's learning point. Must be a speaking or writing exercise, e.g. use a vocabulary word in a sentence about your own life, or write 3 sentences about something you did recently using past tense. Do NOT ask about the story plot or characters."
  }
}`;

    // Claude API 呼叫
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
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
    // 注意:teacher_note 不放這裡。重新生成時若無條件覆蓋,
    // 會把老師當初上傳時打的 note 洗成 null。改由 INSERT / UPDATE 分開處理:
    // - INSERT(首次生成):直接寫入傳入的 note
    // - UPDATE(重新生成):只有這次真的有帶 note 才更新,否則保留原本的
    const reportFields = {
      // 不存逐字稿:它只是 AI 分析的原料,生成後就無用途(學生看不到,
      // 重新生成也是靠前端重新上傳 VTT,不從這裡讀)。存了只會佔空間 —
      // 每份約 69 kB,是報告本體的 8 倍。改存 null,大幅節省資料庫容量。
      transcript_vtt: null,
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

      // teacher_note 只在這次真的有帶內容時才更新,避免重新生成 AI 內容時
      // 把老師原本的 note 覆蓋掉。老師若要改 note,用詳情頁的 Edit 功能。
      const hasNewNote =
        typeof teacherNote === "string" && teacherNote.trim() !== "";
      const updatePayload: Record<string, unknown> = {
        ...reportFields,
        updated_at: new Date().toISOString(),
      };
      if (hasNewNote) {
        updatePayload.teacher_note = teacherNote;
      }

      const { error: updateError } = await admin
        .from("lesson_reports")
        .update(updatePayload)
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
        teacher_note: teacherNote ?? null,
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
