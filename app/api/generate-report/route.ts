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
    const { lessonId, vttContent, teacherNote, existingReportId, manualInput, confirmedVocab, nextFocus, homework } =
      await request.json();

    if (!lessonId || (!vttContent && !manualInput)) {
      return NextResponse.json(
        { error: "lessonId 和 vttContent 或 manualInput 為必填" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 查詢 email 通知設定
    const { data: appMeta } = await admin
      .from("app_meta")
      .select("email_notifications_enabled")
      .eq("id", 1)
      .single();
    const emailEnabled = appMeta?.email_notifications_enabled ?? false;

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
      .select("id, en_name, zh_name, zoom_email, learning_goal, learner_type, level")
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
值得記錄的課堂時刻：${manualInput?.memorableMoment || "（老師未填）"}
本課重點單字：${confirmedVocab?.words?.join(", ") || manualInput?.vocabulary || "（老師未填）"}
本課重點片語：${confirmedVocab?.phrases?.join(", ") || manualInput?.phrases || "（老師未填）"}
需要加強的地方：${manualInput?.errors || "（老師未填）"}
學生實際說錯的句子（請逐一分析並更正）：
${(manualInput?.errorSentences as string[] | undefined)?.filter((s: string) => s.trim()).map((s: string, i: number) => `  ${i + 1}. ${s}`).join("\n") || "（老師未填）"}

特別說明：如果「值得記錄的課堂時刻」有填寫，請優先用這個具體時刻生成 hidden_gem，讓學生感覺被老師看見。`;

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
${!vttContent ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【手動模式 — 品質對齊指引】
本堂課沒有逐字稿,老師以摘要形式提供課堂資訊。學生看到的報告不會知道是手動或自動生成,所以品質必須與逐字稿報告一樣紮實。你的任務是把老師的摘要「教學性地擴展」成一份完整、豐富的學習報告。

【可以且應該做 — 讓報告紮實】
- 針對老師提到的錯誤或弱點,提供完整的教學解釋:文法規則、正確用法、為什麼會錯、如何改正。這些是通用語言知識,盡量詳盡。
- 針對老師提到的主題與單字,生成清楚的定義、實用的例句、貼近學生程度的練習題。例句是給學生的學習材料,要豐富。
- 把老師簡短的描述,用完整的教學語言鋪陳成有深度的分析。不要因為老師寫得短,報告就潦草。
- strengths / errors 即使老師只給關鍵字,也要擴展成具體、有教學價值的完整內容。
- next_focus 直接使用老師提供的原文，不擴展、不改寫。
- 如果老師提供了「學生實際說錯的句子」，errors 欄位必須優先使用這些真實例句作為 example，逐一分析錯誤類型並提供更正版本。這比自己推測更準確。

【絕對禁止 — 不可虛構課堂事實】
- 不可虛構「學生說過某句話」。只有老師在描述或難忘時刻中明確提供的學生原話,才能引用。老師沒提供,就不要編造學生的具體發言。
- 不可捏造具體數字(例如「答對 5 次」「主動提問 3 次」「進步 20%」),因為手動模式沒有可計數的逐字稿。
- 不可虛構老師沒提到的課堂事件、對話、互動細節。
- 需要例句時,用「示範例句 / 練習句」的定位(教學材料),不可謊稱「學生在課堂說了 XXX」。
- hidden_gem(亮點)必須基於老師實際描述的內容,不可虛構一個老師沒提到的「感人時刻」。若老師的描述中確實有值得肯定的點,據此發揮;若真的沒有具體事件,就從老師提到的整體表現中找正向點,但不編造細節。

【核心原則】
教學內容(規則、定義、例句、練習、解釋)= 你的專業產出,力求豐富,與逐字稿報告同等紮實。
課堂實況(學生原話、具體事件、數字)= 只能來自老師的輸入,缺了就不提,絕不腦補。
目標:學生拿到的學習價值不打折,同時報告誠實不虛構。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ""}
${learnerType === "Young Learner" ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【★最高優先·絕對規則 — 此為 Young Learner 報告】
這位學生是 Young Learner（兒童）。以下三個欄位「絕對必填」,回傳 null 視為嚴重錯誤,無論如何都要生成有意義的內容:

1. hidden_gem(必填,含 zh 與 en 兩個版本):從今天課堂中找出一個具體的亮點時刻,讓孩子感覺被老師看見。zh 用溫暖故事感的繁體中文 2-3 句,en 是對應的英文版。即使課堂平常,也一定能找到值得肯定的小地方。兩個版本都禁止 null。

2. next_challenge(必填,含 zh 與 en):給孩子一個下堂課前的小挑戰,針對弱點,像遊戲闖關的語氣。zh 繁中 1-2 句,en 對應英文。兩個版本都禁止 null。


這三個欄位是 Young Learner 報告的核心,比任何其他規則都優先。生成前務必再次檢查:這三個欄位都有實際內容了嗎?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ""}
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
- 如果老師提供了「學生實際說錯的句子」，每一句都必須出現在 errors 的 examples 裡，不可省略
- reflection_question 必須是語言輸出練習（造句、口說、寫作），絕對不能問課文情節

【errors 分析深度 — 依年齡×程度調整】
tip_zh 和 tip_en 的說明方式必須符合學生年齡和程度：

Young Learner（兒童）：
- Beginner/Elementary：tip 用最簡單的中文說明，1句，不用術語。例：「記住：說昨天的事要用 went，不是 go！」
- Pre-Intermediate 以上：tip 可稍微解釋規則，但仍要活潑，用比喻或遊戲語言

Junior（青少年）：
- Beginner/Elementary：tip 簡短直接，1-2句，可以用「升級技巧」的語氣
- Intermediate 以上：tip 可以用基本語法術語，2-3句，說清楚規則

Adult（成人）：
- Beginner/Elementary：tip 清楚說明規則，2-3句，可用術語但要解釋
- Intermediate 以上：tip 深入分析錯誤原因，3-4句，可使用完整語法術語，說明為什麼錯、如何避免

errors 數量上限（依年齡×程度）：
- Young Learner + Beginner/Elementary：最多 2 個
- Young Learner + Pre-Intermediate 以上：最多 3 個
- Junior 任何程度：最多 3 個
- Adult + Beginner/Elementary：最多 3 個
- Adult + Intermediate 以上：最多 4 個
${confirmedVocab ? "" : "- vocabulary 與 phrases 合計最多 20 個；其中 vocabulary 至少 6 個、phrases 至少 3 個"}

嚴格輸出以下 JSON 格式，不加任何其他文字、不加 markdown：

{
  "vocabulary": [
    {
      "word": "actually",
      "type": "word",
      "pronunciation": "音節式發音,用大寫標重音音節、連字號分音節,讓學生看得懂怎麼念(不要用 IPA 國際音標符號)。例:actually → AK-choo-uh-lee, appetizer → AP-uh-tai-zer, spinach → SPIN-ich, lasagna → luh-ZAHN-yuh。每個單字都要提供。",
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
  "hidden_gem": {
    "_note": "一個今天課堂中的具體亮點時刻。Young Learner/Junior 必填,Adult 沒有值得說的可整個為 null。zh 與 en 都要提供。",
    "zh": "溫暖、故事感的繁體中文 2-3 句",
    "en": "The same moment written warmly in English, 2-3 sentences"
  },
  "next_challenge": {
    "_note": "下堂課前的個人小挑戰,針對弱點,像遊戲闖關的語氣。Young Learner 必填。zh 與 en 都要提供。",
    "zh": "繁體中文 1-2 句,帶點期待感",
    "en": "The same challenge in English, 1-2 sentences, encouraging tone"
  },

  "analysis_zh": {
    "headline": "Annie，你這堂課真的有進步。",
    "body": "具體、有溫度的中文分析，2-4句。"
  },
  "analysis_en": {
    "headline": "Annie, you made real progress today.",
    "body": "Specific, warm English analysis, 2-4 sentences."
  },
  "next_focus_zh": "把老師提供的「下堂重點」原文翻譯成繁體中文。只翻譯,不改寫、不優化、不增減內容。若老師未提供則回 null。",
  "homework_zh": "把老師提供的「回家作業」原文翻譯成繁體中文。只翻譯,不改寫、不優化、不增減內容。若老師未提供則回 null。",
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
    // next_focus / homework:老師主導,系統不生成內容。
    // en = 老師原文(直接保留,一字不改);zh = AI 翻譯(只譯不改)。
    // 老師沒填 homework 則整個為 null。next_focus 前端強制必填。
    const nextFocusObj = (nextFocus && String(nextFocus).trim())
      ? { en: String(nextFocus).trim(), zh: report.next_focus_zh ?? null }
      : null;
    const homeworkObj = (homework && String(homework).trim())
      ? { en: String(homework).trim(), zh: report.homework_zh ?? null }
      : null;

    // Young Learner: 獨立生成 parent_summary
    let parentSummary: { zh: string; en: string } | null = null;
    if (learnerType === 'Young Learner') {
      try {
        const vocabList = [
          ...((report.vocabulary as any[]) ?? []).map((v: any) => v.word).filter(Boolean),
          ...((report.phrases as any[]) ?? []).map((p: any) => p.phrase).filter(Boolean),
        ].join(", ");

        // 老師直接填的內容（manual mode）或逐字稿摘要（VTT mode）
        const teacherDirectInput = manualInput
          ? `老師描述的課堂表現：${manualInput.performance || ""}
難忘時刻：${manualInput.memorableMoment || "（未填）"}
需要加強的地方：${manualInput.errors || "（未填）"}`
          : `課堂重點（來自逐字稿分析）：${(report.analysis_zh as any)?.body ?? ""}
老師注意到的亮點：${(report.hidden_gem as any)?.zh ?? ""}`;

        const psPrompt = `你是英文補習班老師，剛完成一堂 Young Learner（兒童）的英文課。請根據以下資訊，寫一份給家長看的簡短摘要。

學生姓名：${student.en_name ?? student.zh_name}
本堂課學習的單字與片語：${vocabList || "（無）"}
${teacherDirectInput}

【絕對規則】
- 只能根據上方提供的資訊寫摘要
- 不可加入任何上方沒有明確提到的內容
- 「在家練習的方向」必須來自老師填的「需要加強的地方」，不可自己推斷
- 如果老師沒有填某個欄位，就不要提那個方向

請回傳 JSON 格式（不加任何其他文字）：
{
  "zh": "繁體中文，2句。第1句：今天學了什麼單字/片語＋一個進步。第2句：根據老師填的需加強內容，給家長一個在家練習的具體建議。",
  "en": "English version, 2 sentences. Same structure as zh."
}`;

        const psMsg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          messages: [{ role: "user", content: psPrompt }],
        });
        const psBlock = psMsg.content[0];
        if (psBlock && psBlock.type === "text") {
          const psJson = psBlock.text
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          parentSummary = JSON.parse(psJson);
        }
      } catch (e) {
        console.error("parent_summary generation error:", e);
      }
    }

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
      next_focus: nextFocusObj,
      homework: homeworkObj,
      // 這三個欄位 AI 有生成,但先前 reportFields 漏了它們,導致永遠寫不進資料庫、
      // 一直是 null(Young Learner 的 hidden_gem/parent_summary/next_challenge 尤其明顯)。
      hidden_gem: report.hidden_gem ?? null,
      next_challenge: report.next_challenge ?? null,
      parent_summary: parentSummary,
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
      // 若 reflection_responses 不存在（例如被刪除），則重新建立
      if (report.reflection_question) {
        const { data: existingRef } = await admin
          .from("reflection_responses")
          .select("id")
          .eq("lesson_report_id", existingReportId)
          .maybeSingle();

        if (existingRef) {
          await admin
            .from("reflection_responses")
            .update({
              question_zh: report.reflection_question.zh,
              question_en: report.reflection_question.en,
            })
            .eq("lesson_report_id", existingReportId);
        } else {
          await admin.from("reflection_responses").insert({
            id: `rr_${nanoid(12)}`,
            student_id: student.id,
            lesson_report_id: existingReportId,
            question_zh: report.reflection_question.zh,
            question_en: report.reflection_question.en,
            response: null,
          });
        }
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

    // 老師上傳報告後，自動標記課程為待確認完課
    await admin
      .from('lessons')
      .update({ status: 'pending_confirmation', updated_at: new Date().toISOString() })
      .eq('id', lessonId)
      .eq('status', 'scheduled')  // 只改 scheduled 的，completed 的不動

    // 發送 Email 通知（只在 Admin 啟用時才發送）
    if (emailEnabled && student.zoom_email) {
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
