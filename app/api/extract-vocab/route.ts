import { NextResponse } from "next/server";

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
    .trim();
}

export async function POST(req: Request) {
  const { vttContent } = await req.json();
  if (!vttContent) return NextResponse.json({ error: "vttContent 為必填" }, { status: 400 });

  const transcript = vttToPlainText(vttContent);

  const prompt = `你是英文課堂詞彙分析專家。請從以下課堂逐字稿中，找出符合條件的重點單字和片語。

逐字稿：
${transcript}

篩選條件（符合任一即列入）：
1. 老師主動停下來解釋這個單字/片語的意思
2. 學生問過這個單字/片語的意思
3. 老師重複強調超過 2 次的單字/片語
4. 老師要求學生造句或練習的單字/片語
5. 學生說錯了然後老師糾正的單字/片語

規則：
- 不設數量上限，完全忠實反映課堂重點
- 不管單字難易度，符合條件就列入
- 不列入只是自然對話帶過、沒有特別強調的單字
- 單字（word）和片語（phrase，2個字以上的固定搭配）分開列
- 只列英文，不要加中文

嚴格回傳以下 JSON 格式，不加任何其他文字：
{
  "words": [
    { "word": "camouflage", "reason": "teacher explained" },
    { "word": "predator", "reason": "student asked" }
  ],
  "phrases": [
    { "phrase": "set off", "reason": "teacher drilled" }
  ]
}

reason 只能是以下其中一個：
- "teacher explained" — 老師主動解釋
- "student asked" — 學生主動詢問
- "teacher corrected" — 老師糾正學生錯誤
- "teacher drilled" — 老師要求練習或造句
- "repeated emphasis" — 老師重複強調超過2次`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const apiData = await apiRes.json();
    const block = apiData.content?.[0];
    if (!block || block.type !== "text") throw new Error("Invalid response");

    const jsonText = block.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const result = JSON.parse(jsonText);
    return NextResponse.json(result);
  } catch (err) {
    console.error("extract-vocab error:", err);
    return NextResponse.json({ error: "提取失敗，請再試一次" }, { status: 500 });
  }
}
