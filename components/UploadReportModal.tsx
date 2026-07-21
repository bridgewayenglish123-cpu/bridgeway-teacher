"use client";

import { useState } from "react";
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

interface Props {
  lessonId: string;
  studentName: string;
  lessonDate: string;
  teacherName: string;
  existingReportId?: string;
  onGenerated: () => void;
  onClose: () => void;
}

type Mode = "vtt" | "manual";
type Step = "upload" | "vocab" | "confirm" | "generating" | "done" | "error";

const MAX_VOCAB = 15;

export function UploadReportModal({
  lessonId, studentName, lessonDate, teacherName,
  existingReportId, onGenerated, onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>("vtt");
  const [step, setStep] = useState<Step>("upload");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [vttContent, setVttContent] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // AI 候選清單（全部）
  const [candidateWords, setCandidateWords] = useState<string[]>([]);
  const [candidatePhrases, setCandidatePhrases] = useState<string[]>([]);

  // 老師勾選的
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [selectedPhrases, setSelectedPhrases] = useState<Set<string>>(new Set());

  // 手動補充
  const [newWord, setNewWord] = useState("");
  const [newPhrase, setNewPhrase] = useState("");
  const [wordWarning, setWordWarning] = useState("");
  const [phraseWarning, setPhraseWarning] = useState("");
  const [extraWords, setExtraWords] = useState<string[]>([]);
  const [extraPhrases, setExtraPhrases] = useState<string[]>([]);
  const [suspectWords, setSuspectWords] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Manual Input
  const [manualPerformance, setManualPerformance] = useState("");
  const [manualVocab, setManualVocab] = useState("");
  const [manualPhrases, setManualPhrases] = useState("");
  const [manualErrors, setManualErrors] = useState("");
  const [manualNextFocus, setManualNextFocus] = useState("");

  // 已選總數
  const totalSelected = selectedWords.size + selectedPhrases.size + extraWords.length + extraPhrases.length;
  const atMax = totalSelected >= MAX_VOCAB;

  // 拼寫檢查
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

  // Step 1: Upload VTT → 提取候選詞彙
  const handleExtractVocab = async () => {
    if (!file) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const text = await file.text();
      setVttContent(text);
      const res = await fetch("/api/extract-vocab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vttContent: text }),
      });
      const data = await res.json();
      if (data.error) { setErrorMsg(data.error); }
      else {
        const words = (data.words || data.vocabulary || []).map((v: any) => typeof v === "string" ? v : v.word).filter(Boolean);
        const phrases = (data.phrases || []).map((p: any) => typeof p === "string" ? p : p.phrase).filter(Boolean);
        setCandidateWords(words);
        setCandidatePhrases(phrases);
        // 預設全部勾選（不超過 MAX_VOCAB）
        const initWords = new Set<string>(words.slice(0, Math.min(words.length, MAX_VOCAB)));
        const remaining = MAX_VOCAB - initWords.size;
        const initPhrases = new Set<string>(phrases.slice(0, Math.max(0, remaining)));
        setSelectedWords(initWords);
        setSelectedPhrases(initPhrases);
        setStep("vocab");
      }
    } catch { setErrorMsg("Extraction failed. Please try again."); }
    finally { setIsLoading(false); }
  };

  // 切換勾選
  const toggleWord = (w: string) => {
    setSelectedWords(prev => {
      const next = new Set(prev);
      if (next.has(w)) { next.delete(w); return next; }
      if (totalSelected >= MAX_VOCAB) return prev;
      next.add(w); return next;
    });
  };

  const togglePhrase = (p: string) => {
    setSelectedPhrases(prev => {
      const next = new Set(prev);
      if (next.has(p)) { next.delete(p); return next; }
      if (totalSelected >= MAX_VOCAB) return prev;
      next.add(p); return next;
    });
  };

  // 手動補充
  const addWord = () => {
    const w = newWord.trim().toLowerCase().replace(/[^a-z\s\'\-]/g, "");
    if (!w || selectedWords.has(w) || extraWords.includes(w)) return;
    if (atMax) return;
    setExtraWords(prev => [...prev, w]);
    setNewWord("");
    setWordWarning("");
  };

  const addPhrase = () => {
    const p = newPhrase.trim().toLowerCase().replace(/[^a-z\s\'\-]/g, "");
    if (!p || selectedPhrases.has(p) || extraPhrases.includes(p)) return;
    if (atMax) return;
    setExtraPhrases(prev => [...prev, p]);
    setNewPhrase("");
    setPhraseWarning("");
  };

  // 驗證並進入確認畫面
  const handleConfirm = async () => {
    setIsValidating(true);
    const allWords = [...Array.from(selectedWords), ...extraWords];
    const allPhrases = [...Array.from(selectedPhrases), ...extraPhrases];
    const manualItems = [...extraWords, ...extraPhrases];

    // 只驗證手動輸入的（AI 找的不驗證）
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

  // Step 2: 生成報告
  const handleGenerate = async () => {
    setStep("generating");
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const finalWords = [...Array.from(selectedWords), ...extraWords];
      const finalPhrases = [...Array.from(selectedPhrases), ...extraPhrases];
      const body = mode === "vtt"
        ? { lessonId, vttContent, vocabulary: finalWords, phrases: finalPhrases, teacherNote: note, existingReportId }
        : { lessonId, manualInput: { performance: manualPerformance, vocabulary: manualVocab, phrases: manualPhrases, errors: manualErrors, nextFocus: manualNextFocus }, teacherNote: note, existingReportId };

      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setStep("done"); onGenerated(); generateOG(lessonId); }
      else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(typeof data?.error === "string" ? data.error : "Generation failed.");
        setStep("error");
      }
    } catch { setStep("error"); }
    finally { setIsLoading(false); }
  };

  // Manual mode 直接生成
  const handleManualConfirm = () => {
    setStep("confirm");
  };

  const handleManualGenerate = async () => {
    setStep("generating");
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, manualInput: { performance: manualPerformance, vocabulary: manualVocab, phrases: manualPhrases, errors: manualErrors, nextFocus: manualNextFocus }, teacherNote: note, existingReportId }),
      });
      if (res.ok) { setStep("done"); onGenerated(); generateOG(lessonId); }
      else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(typeof data?.error === "string" ? data.error : "Generation failed.");
        setStep("error");
      }
    } catch { setStep("error"); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(26,34,54,0.55)" }}
      onClick={e => { if (e.target === e.currentTarget && step !== "generating") onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.line }}>
          <div>
            <div className="font-semibold text-[15px]" style={{ color: C.navy }}>{studentName}</div>
            <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>{lessonDate} · {teacherName}</div>
          </div>
          {step !== "generating" && (
            <button onClick={onClose} className="text-[20px] leading-none" style={{ color: C.muted }}>×</button>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* 模式切換 */}
          {step === "upload" && (
            <div className="flex gap-2">
              {(["vtt", "manual"] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className="flex-1 rounded-xl py-2 text-[13px] font-medium border transition"
                  style={{
                    background: mode === m ? C.navy : "transparent",
                    color: mode === m ? "#fff" : C.muted,
                    borderColor: mode === m ? C.navy : C.line,
                  }}>
                  {m === "vtt" ? "Upload VTT (AI)" : "Manual Input"}
                </button>
              ))}
            </div>
          )}

          {/* Step 進度條 */}
          {mode === "vtt" && step !== "done" && step !== "error" && (
            <div className="flex items-center gap-2">
              {(["upload", "vocab", "confirm", "generating"] as const).map((s, i) => {
                const stepOrder = { upload: 0, vocab: 1, confirm: 2, generating: 3 };
                const currentOrder = stepOrder[step as keyof typeof stepOrder] ?? 0;
                const sOrder = stepOrder[s];
                const done = currentOrder > sOrder;
                const active = step === s;
                return (
                  <div key={s} className="flex items-center gap-2 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={{ background: done ? C.green : active ? C.navy : C.line, color: done || active ? "#fff" : C.muted }}>
                        {done ? "✓" : i + 1}
                      </div>
                      <span className="text-[11px]" style={{ color: active ? C.navy : C.muted }}>
                        {s === "upload" ? "Upload" : s === "vocab" ? "Select" : s === "confirm" ? "Review" : "Generate"}
                      </span>
                    </div>
                    {i < 3 && <div className="flex-1 h-px" style={{ background: C.line }} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 1: VTT Upload */}
          {step === "upload" && mode === "vtt" && (
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-semibold mb-1.5 block" style={{ color: C.muted }}>VTT Transcript</label>
                <input type="file" accept=".vtt"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm" style={{ color: C.navy }} />
              </div>
              <div>
                <label className="text-[12px] font-semibold mb-1.5 block" style={{ color: C.muted }}>Teacher Note (optional)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="Any special observations from this lesson?"
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
                  style={{ borderColor: C.line, color: C.navy }} />
              </div>
              {errorMsg && <div className="text-[12px] rounded-lg px-3 py-2" style={{ background: "#FEF2F2", color: "#DC2626" }}>{errorMsg}</div>}
            </div>
          )}

          {/* Step 1: Manual */}
          {step === "upload" && mode === "manual" && (
            <div className="space-y-3">
              {[
                { label: "Student Performance *", val: manualPerformance, set: setManualPerformance, ph: "e.g. Asked lots of questions today...", rows: 2 },
                { label: "Key Vocabulary (comma separated)", val: manualVocab, set: setManualVocab, ph: "e.g. camouflage, predator, ancient", rows: 1 },
                { label: "Key Phrases (comma separated)", val: manualPhrases, set: setManualPhrases, ph: "e.g. set off, travel light", rows: 1 },
                { label: "Areas to Improve", val: manualErrors, set: setManualErrors, ph: "e.g. Used wrong past tense 4 times", rows: 1 },
                { label: "Next Lesson Focus", val: manualNextFocus, set: setManualNextFocus, ph: "e.g. Practice past tense speaking", rows: 1 },
              ].map(({ label, val, set, ph, rows }) => (
                <div key={label}>
                  <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>{label}</label>
                  <textarea value={val} onChange={e => set(e.target.value)} rows={rows}
                    placeholder={ph} disabled={isLoading}
                    className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none disabled:opacity-50"
                    style={{ borderColor: C.line, color: C.navy }} />
                </div>
              ))}
              <div>
                <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>Teacher Note (optional)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="Message to student" disabled={isLoading}
                  className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none disabled:opacity-50"
                  style={{ borderColor: C.line, color: C.navy }} />
              </div>
            </div>
          )}

          {/* Step 2: 勾選詞彙 */}
          {step === "vocab" && (
            <div className="space-y-4">
              {/* 已選計數 */}
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-semibold" style={{ color: C.navy }}>
                  Select vocabulary for the report
                </div>
                <div className="text-[12px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: atMax ? "#FEF3C7" : "#F0EDE6", color: atMax ? "#92400E" : C.muted }}>
                  {totalSelected} / {MAX_VOCAB} selected
                </div>
              </div>

              {/* 候選單字 */}
              {candidateWords.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
                    Words ({candidateWords.length} found)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {candidateWords.map(w => {
                      const checked = selectedWords.has(w);
                      const disabled = !checked && atMax;
                      return (
                        <button key={w} onClick={() => toggleWord(w)} disabled={disabled}
                          className="rounded-xl px-3 py-1.5 text-[13px] font-medium border transition disabled:opacity-35"
                          style={{
                            background: checked ? C.navy : "#fff",
                            color: checked ? "#fff" : C.navy,
                            borderColor: checked ? C.navy : C.line,
                          }}>
                          {w} {checked ? "✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 候選片語 */}
              {candidatePhrases.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
                    Phrases ({candidatePhrases.length} found)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {candidatePhrases.map(p => {
                      const checked = selectedPhrases.has(p);
                      const disabled = !checked && atMax;
                      return (
                        <button key={p} onClick={() => togglePhrase(p)} disabled={disabled}
                          className="rounded-xl px-3 py-1.5 text-[13px] font-medium border transition disabled:opacity-35"
                          style={{
                            background: checked ? "#5A3A7C" : "#fff",
                            color: checked ? "#fff" : "#5A3A7C",
                            borderColor: checked ? "#5A3A7C" : C.line,
                          }}>
                          {p} {checked ? "✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 手動補充 */}
              {!atMax && (
                <div className="border-t pt-3 space-y-2" style={{ borderColor: C.line }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
                    Add manually ({MAX_VOCAB - totalSelected} slots left)
                  </div>
                  {/* 補充單字 */}
                  <div>
                    <div className="flex gap-2">
                      <input type="text" value={newWord}
                        onChange={e => { setNewWord(e.target.value); setWordWarning(""); }}
                        onKeyDown={e => e.key === "Enter" && addWord()}
                        onBlur={() => checkSpelling(newWord, setWordWarning)}
                        placeholder="Add a word..."
                        className="flex-1 rounded-lg border px-3 py-1.5 text-[13px] outline-none"
                        style={{ borderColor: wordWarning ? "#D97706" : C.line, color: C.navy }} />
                      <Btn kind="ghost" size="sm" onClick={addWord} disabled={!newWord.trim() || atMax}>Add</Btn>
                    </div>
                    {wordWarning && <div className="text-[11px] mt-1" style={{ color: "#D97706" }}>⚠ {wordWarning}</div>}
                  </div>
                  {/* 補充片語 */}
                  <div>
                    <div className="flex gap-2">
                      <input type="text" value={newPhrase}
                        onChange={e => { setNewPhrase(e.target.value); setPhraseWarning(""); }}
                        onKeyDown={e => e.key === "Enter" && addPhrase()}
                        onBlur={() => checkSpelling(newPhrase.split(" ")[0], setPhraseWarning)}
                        placeholder="Add a phrase..."
                        className="flex-1 rounded-lg border px-3 py-1.5 text-[13px] outline-none"
                        style={{ borderColor: phraseWarning ? "#D97706" : C.line, color: C.navy }} />
                      <Btn kind="ghost" size="sm" onClick={addPhrase} disabled={!newPhrase.trim() || atMax}>Add</Btn>
                    </div>
                    {phraseWarning && <div className="text-[11px] mt-1" style={{ color: "#D97706" }}>⚠ {phraseWarning}</div>}
                  </div>
                  {/* 已手動加入的 */}
                  {(extraWords.length > 0 || extraPhrases.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {extraWords.map(w => (
                        <span key={w} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
                          style={{ background: "#EEF2FF", color: "#3730A3" }}>
                          {w}
                          <button onClick={() => setExtraWords(prev => prev.filter(x => x !== w))} className="hover:opacity-60">×</button>
                        </span>
                      ))}
                      {extraPhrases.map(p => (
                        <span key={p} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
                          style={{ background: "#F5F0FF", color: "#5A3A7C" }}>
                          {p}
                          <button onClick={() => setExtraPhrases(prev => prev.filter(x => x !== p))} className="hover:opacity-60">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {atMax && (
                <div className="text-[12px] rounded-lg px-3 py-2" style={{ background: "#FEF3C7", color: "#92400E" }}>
                  Maximum {MAX_VOCAB} items selected. Deselect some to add more.
                </div>
              )}
            </div>
          )}

          {/* 確認摘要 */}
          {step === "confirm" && (
            <div className="space-y-4">
              <div className="text-[14px] font-semibold" style={{ color: C.navy }}>
                Confirm before generating
              </div>

              {/* 摘要 */}
              <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: C.line }}>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: C.muted }}>Words selected</span>
                  <span className="font-semibold" style={{ color: C.navy }}>
                    {selectedWords.size + extraWords.length}
                  </span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: C.muted }}>Phrases selected</span>
                  <span className="font-semibold" style={{ color: C.navy }}>
                    {selectedPhrases.size + extraPhrases.length}
                  </span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: C.muted }}>Total</span>
                  <span className="font-bold" style={{ color: C.gold }}>
                    {totalSelected} / {MAX_VOCAB}
                  </span>
                </div>
              </div>

              {/* 疑問單字警告 */}
              {suspectWords.length > 0 && (
                <div className="rounded-xl p-4 space-y-2" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
                  <div className="text-[13px] font-semibold" style={{ color: "#92400E" }}>
                    ⚠ Possible spelling errors in manually added items:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suspectWords.map(w => (
                      <span key={w} className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                        style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="text-[12px]" style={{ color: "#92400E" }}>
                    You can go back to fix these, or continue anyway.
                  </div>
                </div>
              )}

              {mode === "manual" && (
                <div className="rounded-xl p-3 text-[13px]" style={{ background: "#F0FDF4", color: "#166534" }}>
                  ✓ Manual input ready. Click Generate to create the report.
                </div>
              )}
              {mode === "vtt" && suspectWords.length === 0 && (
                <div className="rounded-xl p-3 text-[13px]" style={{ background: "#F0FDF4", color: "#166534" }}>
                  ✓ All vocabulary looks good. Ready to generate.
                </div>
              )}
            </div>
          )}

          {/* 生成中 */}
          {step === "generating" && (
            <div className="py-8 text-center space-y-3">
              <div className="text-[32px]">⏳</div>
              <div className="text-[14px] font-medium" style={{ color: C.navy }}>Generating report...</div>
              <div className="text-[12px]" style={{ color: C.muted }}>This takes 30–60 seconds. Please wait.</div>
            </div>
          )}

          {/* 完成 */}
          {step === "done" && (
            <div className="py-8 text-center space-y-3">
              <div className="text-[36px]">✓</div>
              <div className="text-[14px] font-medium" style={{ color: C.green }}>Report generated successfully.</div>
              <div className="text-[12px]" style={{ color: C.muted }}>The student can now view their report in Classroom.</div>
            </div>
          )}

          {/* 錯誤 */}
          {step === "error" && (
            <div className="py-4 space-y-2">
              <div className="text-[13px] rounded-lg px-3 py-2" style={{ background: "#FEF2F2", color: "#DC2626" }}>
                {errorMsg || "An error occurred. Please try again."}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-between items-center" style={{ borderColor: C.line }}>
          {step === "upload" && mode === "vtt" && (
            <>
              <Btn kind="ghost" size="sm" onClick={onClose}>Cancel</Btn>
              <Btn kind="gold" size="sm" onClick={handleExtractVocab} disabled={!file || isLoading}>
                {isLoading ? "Analyzing..." : "Next: Select Vocabulary →"}
              </Btn>
            </>
          )}
          {step === "upload" && mode === "manual" && (
            <>
              <Btn kind="ghost" size="sm" onClick={onClose}>Cancel</Btn>
              <Btn kind="gold" size="sm" onClick={handleManualConfirm} disabled={!manualPerformance.trim() || isLoading}>
                Review & Confirm →
              </Btn>
            </>
          )}
          {step === "vocab" && (
            <>
              <Btn kind="ghost" size="sm" onClick={() => setStep("upload")}>← Back</Btn>
              <div className="flex items-center gap-3">
                <span className="text-[12px]" style={{ color: totalSelected === 0 ? C.red : C.muted }}>
                  {totalSelected === 0 ? "Select at least 1 item" : `${totalSelected} selected`}
                </span>
                <Btn kind="gold" size="sm" onClick={handleConfirm} disabled={totalSelected === 0 || isValidating}>
                  {isValidating ? "Checking..." : "Review & Confirm →"}
                </Btn>
              </div>
            </>
          )}
          {step === "confirm" && (
            <>
              <Btn kind="ghost" size="sm" onClick={() => mode === "manual" ? setStep("upload") : setStep("vocab")}>← Back</Btn>
              <Btn kind="gold" size="sm" onClick={mode === "manual" ? handleManualGenerate : handleGenerate}>
                {suspectWords.length > 0 ? "Generate Anyway" : "Generate Report"}
              </Btn>
            </>
          )}
          {step === "generating" && (
            <div className="w-full text-center text-[12px]" style={{ color: C.muted }}>
              Please do not close this window.
            </div>
          )}
          {step === "done" && (
            <div className="w-full flex justify-end">
              <Btn kind="primary" size="sm" onClick={onClose}>Close</Btn>
            </div>
          )}
          {step === "error" && (
            <>
              <Btn kind="ghost" size="sm" onClick={() => setStep("confirm")}>← Back</Btn>
              <Btn kind="gold" size="sm" onClick={handleGenerate}>Retry</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
