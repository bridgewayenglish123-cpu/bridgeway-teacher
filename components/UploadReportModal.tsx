"use client";

import { useState } from "react";
import { C } from "@/lib/constants";

function Btn({ kind, size, onClick, disabled, children }: { kind: string; size: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  const bg = kind === "gold" ? C.gold : kind === "good" ? C.green : "transparent";
  const color = kind === "gold" || kind === "good" ? "#fff" : C.muted;
  const border = kind === "ghost" ? `1px solid ${C.line}` : "none";
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
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
type Step = "upload" | "vocab" | "done" | "error";

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

  // 詞彙確認
  const [words, setWords] = useState<string[]>([]);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [removedWords, setRemovedWords] = useState<string[]>([]);
  const [removedPhrases, setRemovedPhrases] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [newPhrase, setNewPhrase] = useState("");
  const [wordWarning, setWordWarning] = useState("");
  const [phraseWarning, setPhraseWarning] = useState("");

  const checkSpelling = async (word: string, setter: (s: string) => void) => {
    const w = word.trim().toLowerCase()
    if (!w) return
    try {
      // Datamuse: sp= 找拼寫相近的字，如果第一個結果和輸入完全一樣，表示拼寫正確
      const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(w)}&max=3`)
      const data: { word: string; score: number }[] = await res.json()
      if (!data.length) {
        setter(`"${word}" doesn't look like a valid English word.`)
      } else if (data[0].word !== w) {
        // 拼寫不完全相符，提供建議
        const suggestions = data.slice(0, 3).map(d => d.word).join(', ')
        setter(`Did you mean: ${suggestions}?`)
      } else {
        setter('')
      }
    } catch { setter('') }
  }

  const checkWord = (w: string) => checkSpelling(w, setWordWarning)
  const checkPhrase = (p: string) => checkSpelling(p.split(' ')[0], setPhraseWarning)

  // Manual Input
  const [manualPerformance, setManualPerformance] = useState("");
  const [manualVocab, setManualVocab] = useState("");
  const [manualPhrases, setManualPhrases] = useState("");
  const [manualErrors, setManualErrors] = useState("");
  const [manualNextFocus, setManualNextFocus] = useState("");

  const busy = isLoading;

  // Step 1: Upload VTT → 提取詞彙
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
        setWords(data.words ?? []);
        setPhrases(data.phrases ?? []);
        setStep("vocab");
      }
    } catch {
      setErrorMsg("Extraction failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };


  const generateOG = async (lid: string) => {
    try {
      await Promise.all([
        fetch("/api/generate-og", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: lid, template: "lesson" }) }),
        fetch("/api/generate-og", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: lid, template: "milestone" }) }),
      ]);
    } catch {}
  };

  // Step 2: Review Vocabulary後Generate Report
  const handleGenerate = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const body = mode === "vtt"
        ? { lessonId, vttContent, teacherNote: note.trim() || undefined, existingReportId, confirmedVocab: { words, phrases } }
        : { lessonId, existingReportId, manualInput: { performance: manualPerformance, vocabulary: manualVocab, phrases: manualPhrases, errors: manualErrors, nextFocus: manualNextFocus, teacherNote: note } };

      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setStep("done"); onGenerated(); generateOG(lessonId); }
      else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(typeof data?.error === "string" ? data.error : "生成失敗");
        setStep("error");
      }
    } catch {
      setStep("error");
    } finally {
      setIsLoading(false);
    }
  };

  // 手動模式直接生成（不需要詞彙確認步驟）
  const handleManualGenerate = async () => {
    if (!manualPerformance.trim()) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId, existingReportId,
          manualInput: { performance: manualPerformance, vocabulary: manualVocab, phrases: manualPhrases, errors: manualErrors, nextFocus: manualNextFocus, teacherNote: note },
        }),
      });
      if (res.ok) { setStep("done"); onGenerated(); generateOG(lessonId); }
      else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(typeof data?.error === "string" ? data.error : "生成失敗");
        setStep("error");
      }
    } catch {
      setStep("error");
    } finally {
      setIsLoading(false);
    }
  };

  const removeWord = (i: number) => {
    const w = words[i];
    setWords(prev => prev.filter((_, idx) => idx !== i));
    setRemovedWords(prev => [...prev, w]);
  };
  const restoreWord = (w: string) => {
    setRemovedWords(prev => prev.filter(x => x !== w));
    setWords(prev => [...prev, w]);
  };
  const removePhrase = (i: number) => {
    const p = phrases[i];
    setPhrases(prev => prev.filter((_, idx) => idx !== i));
    setRemovedPhrases(prev => [...prev, p]);
  };
  const restorePhrase = (p: string) => {
    setRemovedPhrases(prev => prev.filter(x => x !== p));
    setPhrases(prev => [...prev, p]);
  };
  const addWord = () => {
    const w = newWord.trim();
    if (w && !words.includes(w)) { setWords(prev => [...prev, w]); setNewWord(""); }
  };
  const addPhrase = () => {
    const p = newPhrase.trim();
    if (p && !phrases.includes(p)) { setPhrases(prev => [...prev, p]); setNewPhrase(""); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,30,54,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl p-5 space-y-4 overflow-y-auto max-h-[90vh]"
        style={{ background: "white", boxShadow: "0 8px 32px rgba(15,42,74,0.18)" }}>

        <h3 className="text-base font-semibold" style={{ color: C.navy }}>
          {existingReportId ? "Regenerate AI Report" : "Generate AI Report"}
        </h3>

        {/* 模式切換（只在 upload step 顯示）*/}
        {step === "upload" && (
          <div className="flex gap-1 rounded-lg p-1" style={{ background: "#EAF0F6" }}>
            {(["vtt", "manual"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} disabled={busy}
                className="flex-1 rounded-md py-1.5 text-xs font-semibold transition"
                style={{ background: mode === m ? C.navy : "transparent", color: mode === m ? "#fff" : C.muted }}>
                {m === "vtt" ? "Upload VTT (AI)" : "Manual Input"}
              </button>
            ))}
          </div>
        )}

        {/* 課堂資訊 */}
        <div className="rounded-lg px-3 py-2.5 text-sm space-y-0.5" style={{ background: "#EAF0F6", color: C.navy }}>
          <div><span style={{ color: C.muted }}>Student: </span>{studentName}</div>
          <div><span style={{ color: C.muted }}>Date: </span>{lessonDate}</div>
          <div><span style={{ color: C.muted }}>Teacher: </span>{teacherName}</div>
        </div>

        {/* 進度指示（VTT 模式）*/}
        {mode === "vtt" && step !== "done" && step !== "error" && (
          <div className="flex items-center gap-2">
            {["upload", "vocab"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{
                      background: step === s ? C.navy : step === "vocab" && s === "upload" ? C.green : "#DDE3EA",
                      color: step === s || (step === "vocab" && s === "upload") ? "#fff" : C.muted
                    }}>
                    {step === "vocab" && s === "upload" ? "✓" : i + 1}
                  </div>
                  <span className="text-[11px] font-medium"
                    style={{ color: step === s ? C.navy : C.muted }}>
                    {s === "upload" ? "Upload VTT" : "Review Vocabulary"}
                  </span>
                </div>
                {i === 0 && <div className="flex-1 h-px" style={{ background: C.line, minWidth: 20 }} />}
              </div>
            ))}
          </div>
        )}

        {/* ── Step 1: 上傳 ── */}
        {step === "upload" && mode === "vtt" && (
          <>
            {existingReportId && (
              <div className="rounded-lg p-3 text-xs" style={{ background: "#FFF8E1", color: C.amber }}>
                This will overwrite the existing report.
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>Teacher Note (optional)</label>
              <textarea className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: C.line, color: C.text, minHeight: 60, resize: "vertical" }}
                placeholder="Any special observations from this lesson?"
                value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>
                VTT Transcript <span style={{ color: C.red }}>*</span>
              </label>
              <input type="file" accept=".vtt" className="w-full text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
              {file && <div className="text-xs mt-1" style={{ color: C.muted }}>{file.name}</div>}
            </div>
            {errorMsg && (
              <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: C.red }}>{errorMsg}</div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>Analyzing vocabulary, please wait...</span>}
              <Btn kind="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Btn>
              <Btn kind="gold" size="sm" onClick={handleExtractVocab} disabled={!file || busy}>
                {busy ? "Analyzing..." : "下一步：Review Vocabulary"}
              </Btn>
            </div>
          </>
        )}

        {/* ── Step 1: Manual Input ── */}
        {step === "upload" && mode === "manual" && (
          <>
            <div className="space-y-3">
              {[
                { label: "Student Performance *", value: manualPerformance, set: setManualPerformance, placeholder: "e.g. Asked lots of questions today, made some past tense errors...", rows: 3, required: true },
                { label: "Key Vocabulary (comma separated)", value: manualVocab, set: setManualVocab, placeholder: "e.g. camouflage, predator, ancient", rows: 1 },
                { label: "Key Phrases (comma separated)", value: manualPhrases, set: setManualPhrases, placeholder: "e.g. set off, travel light", rows: 1 },
                { label: "Areas to Improve", value: manualErrors, set: setManualErrors, placeholder: "e.g. Used wrong past tense 4 times", rows: 2 },
                { label: "Next Lesson Focus", value: manualNextFocus, set: setManualNextFocus, placeholder: "e.g. Practice past tense speaking", rows: 2 },
                { label: "Teacher Note (visible to student)", value: note, set: setNote, placeholder: "Message to student", rows: 2 },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>{f.label}</label>
                  {f.rows === 1 ? (
                    <input type="text" value={f.value} onChange={e => f.set(e.target.value)} disabled={busy}
                      placeholder={f.placeholder}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: C.line, color: C.text }} />
                  ) : (
                    <textarea value={f.value} onChange={e => f.set(e.target.value)} disabled={busy}
                      placeholder={f.placeholder} rows={f.rows}
                      className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
                      style={{ borderColor: C.line, color: C.text }} />
                  )}
                </div>
              ))}
            </div>
            {errorMsg && (
              <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: C.red }}>{errorMsg}</div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>AI 生成中，約需 30–60 秒…</span>}
              <Btn kind="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Btn>
              <Btn kind="gold" size="sm" onClick={handleManualGenerate} disabled={!manualPerformance.trim() || busy}>
                {busy ? "Generating..." : "Generate Report"}
              </Btn>
            </div>
          </>
        )}

        {/* ── Step 2: Review Vocabulary ── */}
        {step === "vocab" && (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: "#EAF0F6", color: C.navy }}>
              AI found these key vocabulary items from the transcript. Review and edit before generating the report.
            </div>

            {/* 單字 */}
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: C.muted }}>
                Words ({words.length})
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {words.map((w, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ background: "#EAF0F6", color: C.navy }}>
                    {w}
                    <button onClick={() => removeWord(i)} className="ml-0.5 hover:text-red-500 transition">×</button>
                  </span>
                ))}
                {words.length === 0 && removedWords.length === 0 && (
                  <span className="text-xs" style={{ color: C.muted }}>No words found by AI</span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                <input type="text" value={newWord} onChange={e => { setNewWord(e.target.value); setWordWarning(""); }}
                  onKeyDown={e => e.key === "Enter" && addWord()}
                  onBlur={() => checkWord(newWord)}
                  placeholder="Add a word..." className="w-full rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: wordWarning ? '#D97706' : C.line, color: C.text }} />
                {wordWarning && (
                  <div className="text-[11px] mt-1" style={{ color: '#D97706' }}>⚠ {wordWarning}</div>
                )}
              </div>
                <Btn kind="ghost" size="sm" onClick={addWord} disabled={!newWord.trim()}>Add</Btn>
              </div>
              {removedWords.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] mb-1.5" style={{ color: C.muted }}>Removed (click to restore):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {removedWords.map((w, i) => (
                      <button key={i} onClick={() => restoreWord(w)}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs line-through transition hover:no-underline"
                        style={{ background: "#F5F5F5", color: C.muted }}>
                        {w} <span className="text-[10px] no-underline" style={{ color: C.gold }}>↩</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 片語 */}
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: C.muted }}>
                Phrases ({phrases.length})
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {phrases.map((p, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ background: "#F0EAF6", color: "#5A3A7C" }}>
                    {p}
                    <button onClick={() => removePhrase(i)} className="ml-0.5 hover:text-red-500 transition">×</button>
                  </span>
                ))}
                {phrases.length === 0 && (
                  <span className="text-xs" style={{ color: C.muted }}>No phrases found by AI</span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                <input type="text" value={newPhrase} onChange={e => { setNewPhrase(e.target.value); setPhraseWarning(""); }}
                  onKeyDown={e => e.key === "Enter" && addPhrase()}
                  onBlur={() => checkPhrase(newPhrase)}
                  placeholder="Add a phrase..." className="w-full rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: phraseWarning ? '#D97706' : C.line, color: C.text }} />
                {phraseWarning && (
                  <div className="text-[11px] mt-1" style={{ color: '#D97706' }}>⚠ {phraseWarning}</div>
                )}
              </div>
                <Btn kind="ghost" size="sm" onClick={addPhrase} disabled={!newPhrase.trim()}>Add</Btn>
              </div>
              {removedPhrases.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] mb-1.5" style={{ color: C.muted }}>Removed (click to restore):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {removedPhrases.map((p, i) => (
                      <button key={i} onClick={() => restorePhrase(p)}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs line-through transition hover:no-underline"
                        style={{ background: "#F5F5F5", color: C.muted }}>
                        {p} <span className="text-[10px] no-underline" style={{ color: C.gold }}>↩</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: C.red }}>{errorMsg}</div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>Generating report, please wait...</span>}
              <Btn kind="ghost" size="sm" onClick={() => setStep("upload")} disabled={busy}>← Back</Btn>
              <Btn kind="gold" size="sm" onClick={handleGenerate} disabled={busy}>
                {busy ? "Generating..." : "Confirm & Generate"}
              </Btn>
            </div>
          </>
        )}

        {/* ── 完成 ── */}
        {step === "done" && (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: "#E8F5E9", color: C.green }}>
              Report generated successfully.
            </div>
            <div className="flex justify-end">
              <Btn kind="gold" size="sm" onClick={onClose}>Close</Btn>
            </div>
          </>
        )}

        {/* ── 錯誤 ── */}
        {step === "error" && (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: C.red }}>
              An error occurred. Please try again.{errorMsg ? `（${errorMsg}）` : ""}
            </div>
            <div className="flex justify-end gap-2">
              <Btn kind="ghost" size="sm" onClick={onClose}>Close</Btn>
              <Btn kind="gold" size="sm" onClick={() => setStep("upload")}>Retry</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
