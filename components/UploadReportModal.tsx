"use client";

import { useState, useRef } from "react";
import { C } from "@/lib/constants";

function Btn({ kind, size, onClick, disabled, children }: {
  kind: string; size: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode
}) {
  const bg = kind === "gold" ? C.gold : kind === "primary" ? C.navy : kind === "good" ? C.green : "transparent";
  const color = kind === "gold" || kind === "primary" || kind === "good" ? "#fff" : C.muted;
  const border = kind === "ghost" ? `1px solid ${C.line}` : "none";
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40"
      style={{ background: bg, color, border }}>
      {children}
    </button>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] mt-1 leading-relaxed" style={{ color: C.muted }}>
      {children}
    </div>
  );
}

interface Props {
  lessonId: string;
  studentName: string;
  lessonDate: string;
  teacherName: string;
  existingReportId?: string;
  initialNote?: string | null;
  onGenerated: () => void;
  onClose: () => void;
}

type Mode = "vtt" | "manual";
type Step = "upload" | "vocab" | "confirm" | "generating" | "done" | "error";

const MAX_VOCAB = 20;

export function UploadReportModal({
  lessonId, studentName, lessonDate, teacherName,
  existingReportId, initialNote, onGenerated, onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>("vtt");
  const [step, setStep] = useState<Step>("upload");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── VTT mode ──
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [transcriptMins, setTranscriptMins] = useState<number | null>(null);
  const [vttContent, setVttContent] = useState("");
  const [candidateWords, setCandidateWords] = useState<string[]>([]);
  const [candidatePhrases, setCandidatePhrases] = useState<string[]>([]);
  const [wordReasons, setWordReasons] = useState<Record<string, string>>({});
  const [phraseReasons, setPhraseReasons] = useState<Record<string, string>>({});
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [selectedPhrases, setSelectedPhrases] = useState<Set<string>>(new Set());

  // ── Manual mode ──
  const [manualPerformance, setManualPerformance] = useState("");
  const [manualMoment, setManualMoment] = useState("");
  const [manualErrors, setManualErrors] = useState("");
  const [manualNextFocus, setManualNextFocus] = useState("");
  // next focus(必填)+ homework(選填),兩模式都在 Review 步驟填,老師寫英文原文
  const [nextFocusInput, setNextFocusInput] = useState("");
  const [homeworkInput, setHomeworkInput] = useState("");
  // 重新生成時帶出既有 note,老師才看得到當初打的內容(可保留可修改)
  const [note, setNote] = useState(initialNote ?? "");

  // ── Shared vocab (manual Step 2 + VTT extra) ──
  const [extraWords, setExtraWords] = useState<string[]>([]);
  const [extraPhrases, setExtraPhrases] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [newPhrase, setNewPhrase] = useState("");
  const [wordWarning, setWordWarning] = useState("");
  const [phraseWarning, setPhraseWarning] = useState("");
  // 記錄哪些字是「拼寫查無、但老師堅持加入」的。傳給後端時附註,
  // 讓 Claude 對這些字謹慎處理:能辨識就正常翻譯,無法辨識就誠實說明。
  const [forcedWords, setForcedWords] = useState<Set<string>>(new Set());
  const [forcedPhrases, setForcedPhrases] = useState<Set<string>>(new Set());
  // 打字即時拼寫檢查的防抖計時器(避免每打一個字母就打一次 API)
  const wordSpellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phraseSpellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Confirm ──
  const [suspectWords, setSuspectWords] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);


  const reasonStyle: Record<string, { bg: string; color: string; label: string }> = {
    "teacher explained": { bg: "#EEF2FF", color: "#3730A3", label: "explained" },
    "student asked": { bg: "#F0FDF4", color: "#166534", label: "student asked" },
    "teacher corrected": { bg: "#FEF2F2", color: "#DC2626", label: "corrected" },
    "teacher drilled": { bg: "#FBF8EF", color: "#92400E", label: "drilled" },
    "repeated emphasis": { bg: "#F5F0FF", color: "#5A3A7C", label: "emphasized" },
  };
  const totalSelected = selectedWords.size + selectedPhrases.size + extraWords.length + extraPhrases.length;
  const atMax = totalSelected >= MAX_VOCAB;
  // 嘗試超過上限時的短暫提示(勾選或新增都會用到)
  const [limitHint, setLimitHint] = useState(false);
  const flashLimit = () => { setLimitHint(true); setTimeout(() => setLimitHint(false), 2500); };

  // ── Spell check ──
  const checkSpelling = async (word: string, setter: (s: string) => void) => {
    const w = word.trim().toLowerCase();
    if (!w) return;
    try {
      const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(w)}&max=3`);
      const data: { word: string }[] = await res.json();
      if (!data.length) setter(`"${word}" doesn\'t look like a valid English word.`);
      else if (data[0].word !== w) setter(`Did you mean: ${data.slice(0, 3).map(d => d.word).join(", ")}?`);
      else setter("");
    } catch { setter(""); }
  };

  const generateOG = async (lid: string) => {
    try {
      await Promise.all([
        fetch("/api/generate-og", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: lid, template: "lesson" }) }),
        fetch("/api/generate-og", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: lid, template: "milestone" }) }),
      ]);
    } catch {}
  };

  // ── VTT: Extract vocab ──
  const handleExtractVocab = async () => {
    if (!file) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const text = await file.text();

      // 驗證 VTT 格式
      if (!text.trim().startsWith("WEBVTT")) {
        setErrorMsg("Invalid file format. Please upload a valid .vtt file.");
        setIsLoading(false);
        return;
      }

      // 計算逐字稿時長
      const timeMatches = text.match(/\d{2}:\d{2}:\d{2}\.\d{3}/g);
      if (timeMatches && timeMatches.length > 0) {
        const lastTime = timeMatches[timeMatches.length - 1];
        const [h, m, s] = lastTime.split(":").map(parseFloat);
        const totalMins = Math.round(h * 60 + m + s / 60);
        setTranscriptMins(totalMins);
      }

      setVttContent(text);
      const res = await fetch("/api/extract-vocab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vttContent: text }),
      });
      const data = await res.json();
      if (data.error) { setErrorMsg(data.error); }
      else {
        const rawWords = data.words || data.vocabulary || [];
        const rawPhrases = data.phrases || [];
        const words = rawWords.map((v: any) => typeof v === "string" ? v : v.word).filter(Boolean);
        const phrases = rawPhrases.map((p: any) => typeof p === "string" ? p : p.phrase).filter(Boolean);
        const wReasons: Record<string, string> = {};
        const pReasons: Record<string, string> = {};
        rawWords.forEach((v: any) => { if (v.word && v.reason) wReasons[v.word] = v.reason; });
        rawPhrases.forEach((p: any) => { if (p.phrase && p.reason) pReasons[p.phrase] = p.reason; });
        setCandidateWords(words);
        setCandidatePhrases(phrases);
        setWordReasons(wReasons);
        setPhraseReasons(pReasons);

        // 智慧預選:按 reason 的教學信號強弱決定預選哪些,而非機械地填滿 20。
        // 高信號(糾正/操練/學生提問/重複強調)代表這堂課的重點,預選;
        // 單純「解釋過」信號較弱,不預選,交給老師判斷 —— 這樣也自然留出
        // 空間讓老師手動補充,不會一開場就爆滿。
        // 保底:若高信號項目太少(<6),依原順序補到 6 個,避免開場太空。
        const HIGH_SIGNAL = new Set([
          "teacher corrected", "teacher drilled", "student asked", "repeated emphasis",
        ]);
        const MIN_PRESELECT = 6;

        const pickPreselect = (
          items: string[],
          reasons: Record<string, string>
        ): string[] => {
          const high = items.filter((it) => HIGH_SIGNAL.has(reasons[it]));
          if (high.length >= MIN_PRESELECT) return high;
          // 不足保底數:用高信號 + 其餘依序補齊
          const rest = items.filter((it) => !HIGH_SIGNAL.has(reasons[it]));
          return [...high, ...rest].slice(0, Math.max(MIN_PRESELECT, high.length));
        };

        // 先挑單字,再挑片語,合計不超過 MAX_VOCAB
        let preWords = pickPreselect(words, wReasons);
        let presPhrases = pickPreselect(phrases, pReasons);

        // 合計裁切到 20:優先保留單字,片語填剩餘空間
        if (preWords.length > MAX_VOCAB) preWords = preWords.slice(0, MAX_VOCAB);
        const phraseRoom = Math.max(0, MAX_VOCAB - preWords.length);
        presPhrases = presPhrases.slice(0, phraseRoom);

        const initWords = new Set<string>(preWords);
        const initPhrases = new Set<string>(presPhrases);
        setSelectedWords(initWords);
        setSelectedPhrases(initPhrases);
        setStep("vocab");
      }
    } catch { setErrorMsg("Extraction failed. Please try again."); }
    finally { setIsLoading(false); }
  };

  // ── Toggle selection ──
  const toggleWord = (w: string) => {
    setSelectedWords(prev => {
      const next = new Set(prev);
      if (next.has(w)) { next.delete(w); return next; }
      if (totalSelected >= MAX_VOCAB) { flashLimit(); return prev; }
      next.add(w); return next;
    });
  };
  const togglePhrase = (p: string) => {
    setSelectedPhrases(prev => {
      const next = new Set(prev);
      if (next.has(p)) { next.delete(p); return next; }
      if (totalSelected >= MAX_VOCAB) { flashLimit(); return prev; }
      next.add(p); return next;
    });
  };

  // ── Add extra vocab ──
  // 上限用當下即時計算,不能用渲染時算好的 atMax 閉包值:
  // 使用者常「取消勾選 AI 的字 → 立刻手動新增」,兩個動作相鄰時
  // atMax 還停留在取消前的舊值,會誤擋新增。改成每次新增時重新數。
  const currentTotal = () =>
    selectedWords.size + selectedPhrases.size + extraWords.length + extraPhrases.length;

  const addWord = (force = false) => {
    const w = newWord.trim().toLowerCase().replace(/[^a-z\s\'\-]/g, "");
    if (!w || selectedWords.has(w) || extraWords.includes(w)) return;
    if (currentTotal() >= MAX_VOCAB) { setWordWarning(`Limit reached (${MAX_VOCAB}). Deselect something first.`); return; }
    setExtraWords(prev => [...prev, w]);
    if (force) setForcedWords(prev => new Set(prev).add(w));
    setNewWord(""); setWordWarning("");
  };
  const addPhrase = (force = false) => {
    const p = newPhrase.trim().toLowerCase().replace(/[^a-z\s\'\-]/g, "");
    if (!p || selectedPhrases.has(p) || extraPhrases.includes(p)) return;
    if (currentTotal() >= MAX_VOCAB) { setPhraseWarning(`Limit reached (${MAX_VOCAB}). Deselect something first.`); return; }
    setExtraPhrases(prev => [...prev, p]);
    if (force) setForcedPhrases(prev => new Set(prev).add(p));
    setNewPhrase(""); setPhraseWarning("");
  };
  // 警告文字是否代表「拼寫問題」(而非額度已滿)。用來決定按鈕顯示 Add / Add anyway。
  const isSpellWarning = (warning: string) =>
    warning.startsWith("Did you mean") || warning.includes("doesn't look like");

  // ── Confirm: validate ──
  const handleConfirm = async () => {
    setIsValidating(true);
    const manualItems = [...extraWords, ...extraPhrases];
    const suspects: string[] = [];
    await Promise.all(manualItems.map(async (w) => {
      const term = w.trim().toLowerCase().split(" ")[0];
      if (!term) return;
      try {
        const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&max=1`);
        const data: { word: string }[] = await res.json();
        if (!data.length || data[0].word !== term) suspects.push(w);
      } catch {}
    }));
    setSuspectWords(suspects);
    setIsValidating(false);
    setStep("confirm");
  };

  const handleManualConfirm = async () => {
    setIsValidating(true);
    const allVocab = [...extraWords, ...extraPhrases];
    const suspects: string[] = [];
    await Promise.all(allVocab.map(async (w) => {
      const term = w.trim().toLowerCase().split(" ")[0];
      if (!term) return;
      try {
        const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&max=1`);
        const data: { word: string }[] = await res.json();
        if (!data.length || data[0].word !== term) suspects.push(w);
      } catch {}
    }));
    setSuspectWords(suspects);
    setIsValidating(false);
    setStep("confirm");
  };

  // ── Generate ──
  const handleGenerate = async () => {
    setStep("generating"); setIsLoading(true); setErrorMsg(null);
    try {
      const finalWords = [...Array.from(selectedWords), ...extraWords];
      const finalPhrases = [...Array.from(selectedPhrases), ...extraPhrases];
      // 後端讀的是 confirmedVocab.words / .phrases。先前誤傳成 vocabulary / phrases,
      // 導致老師勾選與手動新增的詞彙完全被忽略、AI 自行重抓。這裡修正欄位名,
      // 並附上 forced 清單(拼寫查無但老師堅持加入的字),供後端提示 Claude 謹慎處理。
      const body = {
        lessonId, vttContent, teacherNote: note, existingReportId,
        nextFocus: nextFocusInput,
        homework: homeworkInput,
        confirmedVocab: {
          words: finalWords,
          phrases: finalPhrases,
          forcedWords: Array.from(forcedWords),
          forcedPhrases: Array.from(forcedPhrases),
        },
      };
      const res = await fetch("/api/generate-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setStep("done"); onGenerated(); generateOG(lessonId); }
      else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(typeof data?.error === "string" ? data.error : "Generation failed.");
        setStep("error");
      }
    } catch { setStep("error"); }
    finally { setIsLoading(false); }
  };

  const handleManualGenerate = async () => {
    setStep("generating"); setIsLoading(true); setErrorMsg(null);
    try {
      const body = {
        lessonId,
        manualInput: {
          performance: manualPerformance,
          memorableMoment: manualMoment,
          vocabulary: extraWords.join(", "),
          phrases: extraPhrases.join(", "),
          errors: manualErrors,
        },
        nextFocus: nextFocusInput,
        homework: homeworkInput,
        // 與 VTT 模式一致:老師手動填的單字/片語直接指定給 AI「照用不改」,
        // 並附 forced 清單讓拼寫存疑字得到謹慎處理。
        confirmedVocab: {
          words: extraWords,
          phrases: extraPhrases,
          forcedWords: Array.from(forcedWords),
          forcedPhrases: Array.from(forcedPhrases),
        },
        teacherNote: note,
        existingReportId,
      };
      const res = await fetch("/api/generate-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setStep("done"); onGenerated(); generateOG(lessonId); }
      else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(typeof data?.error === "string" ? data.error : "Generation failed.");
        setStep("error");
      }
    } catch { setStep("error"); }
    finally { setIsLoading(false); }
  };

  // ── Step indicator labels ──
  const vttSteps = ["upload", "vocab", "confirm", "generating"] as const;
  const manualSteps = ["upload", "vocab", "confirm", "generating"] as const;
  const stepLabels: Record<string, string> = { upload: mode === "manual" ? "Notes" : "Upload", vocab: "Vocabulary", confirm: "Review", generating: "Generate" };
  const stepOrder: Record<string, number> = { upload: 0, vocab: 1, confirm: 2, generating: 3 };
  const currentOrder = stepOrder[step] ?? 0;

  const performanceWordCount = manualPerformance.trim().split(/\s+/).filter(Boolean).length;
  const momentWordCount = manualMoment.trim().split(/\s+/).filter(Boolean).length;
  const errorsWordCount = manualErrors.trim().split(/\s+/).filter(Boolean).length;
  const manualVocabReady = extraWords.length + extraPhrases.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: "rgba(26,34,54,0.55)" }}
      onClick={e => {
        // 只有在最初的 upload 階段點外面才關閉。進入 vocab / confirm 後
        // 已經花了工在選字,誤點背景不該讓成果全失 —— 需按右上角 × 明確關閉。
        if (e.target === e.currentTarget && step === "upload") onClose();
      }}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.line }}>
          <div>
            <div className="font-semibold text-[15px]" style={{ color: C.navy }}>{studentName}</div>
            <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>{lessonDate} · {teacherName}</div>
          </div>
          {step !== "generating" && (
            <button
              onClick={() => {
                // 選字/確認階段已投入工,關閉前二次確認,避免誤觸前功盡棄
                if ((step === "vocab" || step === "confirm")) {
                  if (window.confirm("尚未生成報告,關閉將遺失已選的詞彙。確定關閉?")) onClose();
                } else {
                  onClose();
                }
              }}
              className="text-[20px] leading-none" style={{ color: C.muted }}>×</button>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Mode toggle */}
          {step === "upload" && (
            <>
              <div className="flex gap-2">
                {(["vtt", "manual"] as Mode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className="flex-1 rounded-xl py-2 text-[13px] font-medium border transition"
                    style={{ background: mode === m ? C.navy : "transparent", color: mode === m ? "#fff" : C.muted, borderColor: mode === m ? C.navy : C.line }}>
                    {m === "vtt" ? "Upload VTT (AI)" : "Manual Input"}
                  </button>
                ))}
              </div>
              {mode === "manual" && (
                <div className="rounded-xl px-3 py-2.5 text-[12px]" style={{ background: "#EEF2FF", color: "#3730A3" }}>
                  💡 Have a recording? Switch to <button onClick={() => setMode("vtt")} className="underline font-medium">Upload VTT</button> for a more detailed, personalised report.
                </div>
              )}
            </>
          )}

          {/* Step indicator */}
          {step !== "done" && step !== "error" && (
            <div className="flex items-center gap-1">
              {(["upload", "vocab", "confirm", "generating"] as const).map((s, i) => {
                const sOrder = stepOrder[s];
                const done = currentOrder > sOrder;
                const active = step === s;
                return (
                  <div key={s} className="flex items-center gap-1 flex-1">
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                        style={{ background: done ? C.green : active ? C.navy : C.line, color: done || active ? "#fff" : C.muted }}>
                        {done ? "✓" : i + 1}
                      </div>
                      <span className="text-[11px] hidden sm:block" style={{ color: active ? C.navy : C.muted }}>
                        {stepLabels[s]}
                      </span>
                    </div>
                    {i < 3 && <div className="flex-1 h-px mx-1" style={{ background: C.line }} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── VTT Upload ── */}
          {step === "upload" && mode === "vtt" && (
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-semibold mb-1.5 block" style={{ color: C.muted }}>VTT Transcript *</label>
                <input type="file" accept=".vtt" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); setFileName(f?.name ?? ''); setTranscriptMins(null); }} className="w-full text-sm" style={{ color: C.navy }} />
                {fileName && (
                  <div className="mt-1.5 text-[11px] flex items-center gap-1.5" style={{ color: C.muted }}>
                    <span>📄</span>
                    <span className="font-medium" style={{ color: C.navy }}>{fileName}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>Teacher Note <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span></label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="A personal message to your student — visible in their report."
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: C.line, color: C.navy }} />
              </div>
              {errorMsg && <div className="text-[12px] rounded-lg px-3 py-2" style={{ background: "#FEF2F2", color: "#DC2626" }}>{errorMsg}</div>}
            </div>
          )}

          {/* ── Manual Step 1: Lesson Notes ── */}
          {step === "upload" && mode === "manual" && (
            <div className="space-y-4">
              {/* Student Performance */}
              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                  What happened in today\'s lesson? * <span style={{ fontWeight: 400, color: C.muted }}>&mdash; topic, activities, how it went</span>
                  <span className="ml-2 font-normal" style={{ color: performanceWordCount >= 20 ? C.green : C.amber }}>
                    {performanceWordCount} words {performanceWordCount < 20 ? "(min. 20)" : "✓"}
                  </span>
                </label>
                <textarea value={manualPerformance} onChange={e => setManualPerformance(e.target.value)} rows={5}
                  placeholder={"Describe what you covered, how the student engaged, any breakthroughs or difficulties.\n\ne.g. Nancy and I discussed Taiwanese food and cooking methods. She actively used sequencing words (first, then, finally) but consistently used present tense instead of past tense when narrating. She was engaged and asked good questions about vocabulary."}
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: performanceWordCount > 0 && performanceWordCount < 20 ? C.amber : C.line, color: C.navy }} />
                <FieldHint>Cover: topic covered · student engagement · any breakthroughs or struggles</FieldHint>
              </div>

              {/* Memorable Moment */}
              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                  A memorable moment or quote? * <span style={{ fontWeight: 400, color: C.muted }}>&mdash; becomes the highlight</span>
                  <span className="ml-2 font-normal" style={{ color: momentWordCount >= 10 ? C.green : C.amber }}>
                    {momentWordCount} words {momentWordCount < 10 ? "(min. 10)" : "\u2713"}
                  </span>
                </label>
                <textarea value={manualMoment} onChange={e => setManualMoment(e.target.value)} rows={2}
                  placeholder={"e.g. Nancy said \'I want to make the beef noodle soup that my grandma teached me\' — she used \'teached\' instead of \'taught\'"}
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: C.line, color: C.navy }} />
                <FieldHint>A specific moment helps AI generate a more personalised report for your student.</FieldHint>
              </div>

              {/* Areas to Improve */}
              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                  What does the student need to improve? * <span style={{ fontWeight: 400, color: C.muted }}>&mdash; becomes the error analysis</span>
                  <span className="ml-2 font-normal" style={{ color: errorsWordCount >= 8 ? C.green : C.amber }}>
                    {errorsWordCount} words {errorsWordCount < 8 ? "(min. 8)" : "\u2713"}
                  </span>
                  <span className="ml-2 font-normal" style={{ color: errorsWordCount >= 8 ? C.green : C.amber }}>
                    {errorsWordCount} words {errorsWordCount < 8 ? "(min. 8)" : "\u2713"}
                  </span>
                </label>
                <textarea value={manualErrors} onChange={e => setManualErrors(e.target.value)} rows={2}
                  placeholder={"e.g. Past tense irregular verbs (eat→ate, go→went)\nMispronouncing \'shrimp\' and \'olive oil\'"}
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: C.line, color: C.navy }} />
                <FieldHint>Include the student&rsquo;s actual words where you can &mdash; e.g. Said &ldquo;I go yesterday&rdquo; (should be &ldquo;went&rdquo;). This lets the report analyse real mistakes instead of inventing examples.</FieldHint>
              </div>

              {/* Next Lesson Focus */}
              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                  What will you focus on next lesson? <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea value={manualNextFocus} onChange={e => setManualNextFocus(e.target.value)} rows={2}
                  placeholder={"e.g. Practice narrating past events using irregular verbs\nIntroduce more sequencing vocabulary"}
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: C.line, color: C.navy }} />
                <FieldHint>Your plan for the next session.</FieldHint>
              </div>

              {/* Teacher Note */}
              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                  Teacher Note <span style={{ fontWeight: 400 }}>(optional — visible to student)</span>
                </label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder={"e.g. Great effort today! Your food vocabulary is really growing."}
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: C.line, color: C.navy }} />
              </div>
            </div>
          )}

          {/* ── VTT Vocab Selection (Step 2) ── */}
          {step === "vocab" && mode === "vtt" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: C.navy }}>Select vocabulary for the report</div>
                  {transcriptMins !== null && (
                    <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>
                      📄 {fileName} · {transcriptMins} min transcript
                    </div>
                  )}
                </div>
                <div className="text-[12px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: atMax ? "#FEF3C7" : "#F0EDE6", color: atMax ? "#92400E" : C.muted }}>
                  <span style={{ color: atMax ? "#DC2626" : undefined, fontWeight: atMax ? 700 : undefined }}>{totalSelected} / {MAX_VOCAB}</span>
                  {limitHint && <span className="ml-2 text-[11px]" style={{ color: "#DC2626" }}>已達上限,請先移除一個</span>}
                </div>
              </div>

              {candidateWords.length === 0 && candidatePhrases.length === 0 && (
                <div className="rounded-xl p-4 text-center space-y-2" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
                  <div className="text-[13px] font-semibold" style={{ color: "#92400E" }}>
                    ⚠ No vocabulary found in the transcript.
                  </div>
                  <div className="text-[12px]" style={{ color: "#92400E" }}>
                    The AI could not identify any key vocabulary from this recording. You can add words and phrases manually below, or go back and try a different file.
                  </div>
                </div>
              )}

              {candidateWords.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>Words ({candidateWords.length} found by AI)</div>
                  <div className="flex flex-wrap gap-2">
                    {candidateWords.map(w => {
                      const checked = selectedWords.has(w);
                      const rs = wordReasons[w] ? reasonStyle[wordReasons[w]] : null;
                      return (
                        <div key={w} className="flex flex-col items-start gap-0.5">
                          <button onClick={() => toggleWord(w)} disabled={!checked && atMax}
                            className="rounded-xl px-3 py-2 sm:py-1.5 text-[13px] font-medium border transition disabled:opacity-35 active:scale-95"
                            style={{ background: checked ? C.navy : "#fff", color: checked ? "#fff" : C.navy, borderColor: checked ? C.navy : C.line }}>
                            {w} {checked ? "✓" : ""}
                          </button>
                          {rs && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: rs.bg, color: rs.color }}>
                              {rs.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {candidatePhrases.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>Phrases ({candidatePhrases.length} found by AI)</div>
                  <div className="flex flex-wrap gap-2">
                    {candidatePhrases.map(p => {
                      const checked = selectedPhrases.has(p);
                      const rs = phraseReasons[p] ? reasonStyle[phraseReasons[p]] : null;
                      return (
                        <div key={p} className="flex flex-col items-start gap-0.5">
                          <button onClick={() => togglePhrase(p)} disabled={!checked && atMax}
                            className="rounded-xl px-3 py-2 sm:py-1.5 text-[13px] font-medium border transition disabled:opacity-35 active:scale-95"
                            style={{ background: checked ? "#5A3A7C" : "#fff", color: checked ? "#fff" : "#5A3A7C", borderColor: checked ? "#5A3A7C" : C.line }}>
                            {p} {checked ? "✓" : ""}
                          </button>
                          {rs && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: rs.bg, color: rs.color }}>
                              {rs.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Manual add */}
              {(
                <div className="border-t pt-3 space-y-2" style={{ borderColor: C.line }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: atMax ? "#DC2626" : C.muted }}>
                    {atMax ? `已達上限 ${MAX_VOCAB}，請先移除項目再新增` : `Add manually (${MAX_VOCAB - totalSelected} slots left)`}
                  </div>
                  <div>
                    <div className="flex gap-2">
                      <input type="text" value={newWord}
                        onChange={e => {
                        const v = e.target.value;
                        setNewWord(v); setWordWarning("");
                        if (wordSpellTimer.current) clearTimeout(wordSpellTimer.current);
                        if (v.trim()) wordSpellTimer.current = setTimeout(() => checkSpelling(v, setWordWarning), 500);
                      }}
                        onKeyDown={e => e.key === "Enter" && addWord(isSpellWarning(wordWarning))}
                        onBlur={() => checkSpelling(newWord, setWordWarning)}
                        placeholder="Add a word..."
                        className="flex-1 rounded-lg border px-3 py-1.5 text-[13px] outline-none"
                        style={{ borderColor: wordWarning ? "#D97706" : C.line, color: C.navy }} />
                      <button type="button" onClick={() => addWord(isSpellWarning(wordWarning))} disabled={!newWord.trim()}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-medium border transition disabled:opacity-40"
                        style={isSpellWarning(wordWarning)
                          ? { borderColor: "#D97706", color: "#D97706", background: "#FFFBEB" }
                          : { borderColor: C.line, color: C.navy, background: "#fff" }}>
                        {isSpellWarning(wordWarning) ? "Add anyway" : "Add"}
                      </button>
                    </div>
                    {wordWarning && <div className="text-[11px] mt-1" style={{ color: "#D97706" }}>⚠ {wordWarning}</div>}
                  </div>
                  <div>
                    <div className="flex gap-2">
                      <input type="text" value={newPhrase}
                        onChange={e => {
                        const v = e.target.value;
                        setNewPhrase(v); setPhraseWarning("");
                        if (phraseSpellTimer.current) clearTimeout(phraseSpellTimer.current);
                        if (v.trim()) phraseSpellTimer.current = setTimeout(() => checkSpelling(v.split(" ")[0], setPhraseWarning), 500);
                      }}
                        onKeyDown={e => e.key === "Enter" && addPhrase(isSpellWarning(phraseWarning))}
                        onBlur={() => checkSpelling(newPhrase.split(" ")[0], setPhraseWarning)}
                        placeholder="Add a phrase..."
                        className="flex-1 rounded-lg border px-3 py-1.5 text-[13px] outline-none"
                        style={{ borderColor: phraseWarning ? "#D97706" : C.line, color: C.navy }} />
                      <button type="button" onClick={() => addPhrase(isSpellWarning(phraseWarning))} disabled={!newPhrase.trim()}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-medium border transition disabled:opacity-40"
                        style={isSpellWarning(phraseWarning)
                          ? { borderColor: "#D97706", color: "#D97706", background: "#FFFBEB" }
                          : { borderColor: C.line, color: C.navy, background: "#fff" }}>
                        {isSpellWarning(phraseWarning) ? "Add anyway" : "Add"}
                      </button>
                    </div>
                    {phraseWarning && <div className="text-[11px] mt-1" style={{ color: "#D97706" }}>⚠ {phraseWarning}</div>}
                  </div>
                  {(extraWords.length > 0 || extraPhrases.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {extraWords.map(w => (
                        <span key={w} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
                          style={{ background: "#EEF2FF", color: "#3730A3" }}>
                          {w} <button onClick={() => setExtraWords(prev => prev.filter(x => x !== w))}>×</button>
                        </span>
                      ))}
                      {extraPhrases.map(p => (
                        <span key={p} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
                          style={{ background: "#F5F0FF", color: "#5A3A7C" }}>
                          {p} <button onClick={() => setExtraPhrases(prev => prev.filter(x => x !== p))}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* ── Manual Vocab (Step 2) ── */}
          {step === "vocab" && mode === "manual" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold" style={{ color: C.navy }}>Add vocabulary from this lesson</div>
                <div className="text-[12px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: atMax ? "#FEF3C7" : "#F0EDE6", color: atMax ? "#92400E" : C.muted }}>
                  <span style={{ color: atMax ? "#DC2626" : undefined, fontWeight: atMax ? 700 : undefined }}>{totalSelected} / {MAX_VOCAB}</span>
                  {limitHint && <span className="ml-2 text-[11px]" style={{ color: "#DC2626" }}>已達上限,請先移除一個</span>}
                </div>
              </div>

              <div className="rounded-xl px-3 py-2.5 text-[12px]" style={{ background: "#FEF3C7", color: "#92400E" }}>
                ⚠ At least one word or phrase is required to generate a report.
              </div>

              {/* Words */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>Words</div>
                <div className="flex gap-2">
                  <input type="text" value={newWord}
                    onChange={e => {
                        const v = e.target.value;
                        setNewWord(v); setWordWarning("");
                        if (wordSpellTimer.current) clearTimeout(wordSpellTimer.current);
                        if (v.trim()) wordSpellTimer.current = setTimeout(() => checkSpelling(v, setWordWarning), 500);
                      }}
                    onKeyDown={e => e.key === "Enter" && addWord(isSpellWarning(wordWarning))}
                    onBlur={() => checkSpelling(newWord, setWordWarning)}
                    placeholder="e.g. camouflage"
                    className="flex-1 rounded-lg border px-3 py-1.5 text-[13px] outline-none"
                    style={{ borderColor: wordWarning ? "#D97706" : C.line, color: C.navy }} />
                  <button type="button" onClick={() => addWord(isSpellWarning(wordWarning))} disabled={!newWord.trim()}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-medium border transition disabled:opacity-40"
                        style={isSpellWarning(wordWarning)
                          ? { borderColor: "#D97706", color: "#D97706", background: "#FFFBEB" }
                          : { borderColor: C.line, color: C.navy, background: "#fff" }}>
                        {isSpellWarning(wordWarning) ? "Add anyway" : "Add"}
                      </button>
                </div>
                {wordWarning && <div className="text-[11px] mt-1" style={{ color: "#D97706" }}>⚠ {wordWarning}</div>}
                <FieldHint>Words the student learned or needed correction on. Press Enter or click Add.</FieldHint>
              </div>

              {/* Phrases */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>Phrases</div>
                <div className="flex gap-2">
                  <input type="text" value={newPhrase}
                    onChange={e => {
                        const v = e.target.value;
                        setNewPhrase(v); setPhraseWarning("");
                        if (phraseSpellTimer.current) clearTimeout(phraseSpellTimer.current);
                        if (v.trim()) phraseSpellTimer.current = setTimeout(() => checkSpelling(v.split(" ")[0], setPhraseWarning), 500);
                      }}
                    onKeyDown={e => e.key === "Enter" && addPhrase(isSpellWarning(phraseWarning))}
                    onBlur={() => checkSpelling(newPhrase.split(" ")[0], setPhraseWarning)}
                    placeholder="e.g. set off, make sure you"
                    className="flex-1 rounded-lg border px-3 py-1.5 text-[13px] outline-none"
                    style={{ borderColor: phraseWarning ? "#D97706" : C.line, color: C.navy }} />
                  <button type="button" onClick={() => addPhrase(isSpellWarning(phraseWarning))} disabled={!newPhrase.trim()}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-medium border transition disabled:opacity-40"
                        style={isSpellWarning(phraseWarning)
                          ? { borderColor: "#D97706", color: "#D97706", background: "#FFFBEB" }
                          : { borderColor: C.line, color: C.navy, background: "#fff" }}>
                        {isSpellWarning(phraseWarning) ? "Add anyway" : "Add"}
                      </button>
                </div>
                {phraseWarning && <div className="text-[11px] mt-1" style={{ color: "#D97706" }}>⚠ {phraseWarning}</div>}
                <FieldHint>Multi-word expressions or collocations. Press Enter or click Add.</FieldHint>
              </div>

              {/* Tags */}
              {(extraWords.length > 0 || extraPhrases.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {extraWords.map(w => (
                    <span key={w} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
                      style={{ background: "#EEF2FF", color: "#3730A3" }}>
                      {w} <button onClick={() => setExtraWords(prev => prev.filter(x => x !== w))}>×</button>
                    </span>
                  ))}
                  {extraPhrases.map(p => (
                    <span key={p} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
                      style={{ background: "#F5F0FF", color: "#5A3A7C" }}>
                      {p} <button onClick={() => setExtraPhrases(prev => prev.filter(x => x !== p))}>×</button>
                    </span>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* ── Confirm ── */}
          {step === "confirm" && (
            <div className="space-y-4">
              <div className="text-[14px] font-semibold" style={{ color: C.navy }}>Review before generating</div>

              {/* Summary */}
              <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: C.line }}>
                {mode === "vtt" ? (<>
                  <div className="flex justify-between text-[13px]">
                    <span style={{ color: C.muted }}>Words selected</span>
                    <span className="font-semibold" style={{ color: C.navy }}>{selectedWords.size + extraWords.length}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span style={{ color: C.muted }}>Phrases selected</span>
                    <span className="font-semibold" style={{ color: C.navy }}>{selectedPhrases.size + extraPhrases.length}</span>
                  </div>
                </>) : (<>
                  <div className="flex justify-between text-[13px]">
                    <span style={{ color: C.muted }}>Lesson notes</span>
                    <span className="font-semibold" style={{ color: C.navy }}>{performanceWordCount} words</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span style={{ color: C.muted }}>Vocabulary added</span>
                    <span className="font-semibold" style={{ color: C.navy }}>{extraWords.length + extraPhrases.length} items</span>
                  </div>
                </>)}
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: C.muted }}>Total vocabulary</span>
                  <span className="font-bold" style={{ color: atMax ? "#DC2626" : C.gold }}>{totalSelected} / {MAX_VOCAB}</span>
                </div>
              </div>

              {/* Next Focus(必填)+ Homework(選填)— 老師寫英文,系統翻譯中文給學生 */}
              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                  Next lesson focus * <span style={{ fontWeight: 400, color: C.muted }}>&mdash; your plan, shown to the student</span>
                </label>
                <textarea value={nextFocusInput} onChange={e => setNextFocusInput(e.target.value)} rows={3}
                  placeholder={"What will you focus on next lesson? Write in English — the student sees it in both English and Chinese.\n\ne.g. Review irregular past tense verbs and practise using them in short stories about your week."}
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: nextFocusInput.trim() ? C.line : C.amber, color: C.navy }} />
                <FieldHint>You write in English. The student sees your exact words, plus a Chinese translation.</FieldHint>
              </div>

              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                  Homework <span style={{ fontWeight: 400, color: C.muted }}>(optional) &mdash; kept exactly as you write it</span>
                </label>
                <textarea value={homeworkInput} onChange={e => setHomeworkInput(e.target.value)} rows={3}
                  placeholder={"Any homework for the student? Write in English — it is preserved word-for-word, never rewritten.\n\ne.g. Write 5 sentences about what you did last weekend using past tense verbs."}
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: C.line, color: C.navy }} />
                <FieldHint>Your exact words are kept. The student sees them with a Chinese translation.</FieldHint>
              </div>

              {/* Quality reminder for manual */}
              {mode === "manual" && (
                <div className="rounded-xl p-3 text-[12px] leading-relaxed" style={{ background: "#EEF2FF", color: "#3730A3" }}>
                  💡 Manual reports rely entirely on your notes. The more detail you provided, the better the report will be for your student.
                </div>
              )}

              {/* Suspect words */}
              {suspectWords.length > 0 && (
                <div className="rounded-xl p-4 space-y-2" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
                  <div className="text-[13px] font-semibold" style={{ color: "#92400E" }}>⚠ Possible spelling errors:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {suspectWords.map(w => (
                      <span key={w} className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                        style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>{w}</span>
                    ))}
                  </div>
                  <div className="text-[12px]" style={{ color: "#92400E" }}>You can go back to fix these, or continue anyway.</div>
                </div>
              )}

              {suspectWords.length === 0 && (
                <div className="rounded-xl p-3 text-[13px]" style={{ background: "#F0FDF4", color: "#166534" }}>
                  ✓ Everything looks good. Ready to generate.
                </div>
              )}
            </div>
          )}

          {/* Generating */}
          {step === "generating" && (
            <div className="py-8 text-center space-y-3">
              <div className="text-[32px]">⏳</div>
              <div className="text-[14px] font-medium" style={{ color: C.navy }}>Generating report...</div>
              <div className="text-[12px]" style={{ color: C.muted }}>This takes 30–60 seconds. Please wait.</div>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="py-8 text-center space-y-3">
              <div className="text-[36px]">✓</div>
              <div className="text-[14px] font-medium" style={{ color: C.green }}>Report generated successfully.</div>
              <div className="text-[12px]" style={{ color: C.muted }}>The student can now view their report in Classroom.</div>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="py-4">
              <div className="text-[13px] rounded-lg px-3 py-2" style={{ background: "#FEF2F2", color: "#DC2626" }}>
                {errorMsg || "An error occurred. Please try again."}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-between items-center gap-2" style={{ borderColor: C.line }}>
          {step === "upload" && mode === "vtt" && (
            <>
              <Btn kind="ghost" size="sm" onClick={onClose}>Cancel</Btn>
              <Btn kind="gold" size="sm" onClick={handleExtractVocab} disabled={!file || isLoading}>
  {isLoading ? "Analyzing transcript... (~15s)" : "Next: Select Vocabulary →"}
              </Btn>
            </>
          )}
          {step === "upload" && mode === "manual" && (
            <>
              <Btn kind="ghost" size="sm" onClick={onClose}>Cancel</Btn>
              <Btn kind="gold" size="sm"
                onClick={() => setStep("vocab")}
                disabled={performanceWordCount < 20 || momentWordCount < 10 || errorsWordCount < 8}>
                Next: Add Vocabulary →
              </Btn>
            </>
          )}
          {step === "vocab" && (
            <>
              <Btn kind="ghost" size="sm" onClick={() => setStep("upload")}>← Back</Btn>
              <div className="flex items-center gap-3">
                {mode === "manual" && !manualVocabReady && (
                  <span className="text-[12px]" style={{ color: C.red }}>Add at least 1 word or phrase</span>
                )}
                {mode === "vtt" && totalSelected === 0 && (
                  <span className="text-[12px]" style={{ color: C.red }}>Select at least 1 item</span>
                )}
                <Btn kind="gold" size="sm"
                  onClick={mode === "manual" ? handleManualConfirm : handleConfirm}
                  disabled={(mode === "manual" ? !manualVocabReady : totalSelected === 0) || isValidating}>
                  {isValidating ? "Checking..." : "Review & Confirm →"}
                </Btn>
              </div>
            </>
          )}
          {step === "confirm" && (
            <>
              {!nextFocusInput.trim() && (
                <span className="text-[12px] self-center mr-1" style={{ color: C.amber }}>Next lesson focus is required</span>
              )}
              <Btn kind="ghost" size="sm" onClick={() => setStep("vocab")}>← Back</Btn>
              <Btn kind="gold" size="sm" onClick={mode === "manual" ? handleManualGenerate : handleGenerate}
                disabled={!nextFocusInput.trim()}>
                {suspectWords.length > 0 ? "Generate Anyway" : "Generate Report"}
              </Btn>
            </>
          )}
          {step === "generating" && (
            <div className="w-full text-center text-[12px]" style={{ color: C.muted }}>Please do not close this window.</div>
          )}
          {step === "done" && (
            <div className="w-full flex justify-end">
              <Btn kind="primary" size="sm" onClick={onClose}>Close</Btn>
            </div>
          )}
          {step === "error" && (
            <>
              <Btn kind="ghost" size="sm" onClick={() => setStep("confirm")}>← Back</Btn>
              <Btn kind="gold" size="sm" onClick={mode === "manual" ? handleManualGenerate : handleGenerate}>Retry</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
