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

export default function UploadReportModal({
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
  const [newWord, setNewWord] = useState("");
  const [newPhrase, setNewPhrase] = useState("");

  // 手動填寫
  const [manualPerformance, setManualPerformance] = useState("");
  const [manualVocab, setManualVocab] = useState("");
  const [manualPhrases, setManualPhrases] = useState("");
  const [manualErrors, setManualErrors] = useState("");
  const [manualNextFocus, setManualNextFocus] = useState("");

  const busy = isLoading;

  // Step 1: 上傳 VTT → 提取詞彙
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
      setErrorMsg("提取失敗，請再試一次");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: 確認詞彙後生成報告
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
      if (res.ok) { setStep("done"); onGenerated(); }
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
      if (res.ok) { setStep("done"); onGenerated(); }
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

  const removeWord = (i: number) => setWords(w => w.filter((_, idx) => idx !== i));
  const removePhrase = (i: number) => setPhrases(p => p.filter((_, idx) => idx !== i));
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
          {existingReportId ? "重新生成 AI 學習報告" : "生成 AI 學習報告"}
        </h3>

        {/* 模式切換（只在 upload step 顯示）*/}
        {step === "upload" && (
          <div className="flex gap-1 rounded-lg p-1" style={{ background: "#EAF0F6" }}>
            {(["vtt", "manual"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} disabled={busy}
                className="flex-1 rounded-md py-1.5 text-xs font-semibold transition"
                style={{ background: mode === m ? C.navy : "transparent", color: mode === m ? "#fff" : C.muted }}>
                {m === "vtt" ? "上傳 VTT（AI 生成）" : "手動填寫"}
              </button>
            ))}
          </div>
        )}

        {/* 課堂資訊 */}
        <div className="rounded-lg px-3 py-2.5 text-sm space-y-0.5" style={{ background: "#EAF0F6", color: C.navy }}>
          <div><span style={{ color: C.muted }}>學生：</span>{studentName}</div>
          <div><span style={{ color: C.muted }}>日期：</span>{lessonDate}</div>
          <div><span style={{ color: C.muted }}>老師：</span>{teacherName}</div>
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
                    {s === "upload" ? "上傳 VTT" : "確認詞彙"}
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
                重新生成將覆蓋現有報告。
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>老師手記（選填）</label>
              <textarea className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: C.line, color: C.text, minHeight: 60, resize: "vertical" }}
                placeholder="這堂課有什麼特別的觀察？"
                value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>
                VTT 轉錄檔 <span style={{ color: C.red }}>*</span>
              </label>
              <input type="file" accept=".vtt" className="w-full text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
              {file && <div className="text-xs mt-1" style={{ color: C.muted }}>{file.name}</div>}
            </div>
            {errorMsg && (
              <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: C.red }}>{errorMsg}</div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>AI 分析詞彙中，約需 15–30 秒…</span>}
              <Btn kind="ghost" size="sm" onClick={onClose} disabled={busy}>關閉</Btn>
              <Btn kind="gold" size="sm" onClick={handleExtractVocab} disabled={!file || busy}>
                {busy ? "分析中…" : "下一步：確認詞彙"}
              </Btn>
            </div>
          </>
        )}

        {/* ── Step 1: 手動填寫 ── */}
        {step === "upload" && mode === "manual" && (
          <>
            <div className="space-y-3">
              {[
                { label: "學生課堂表現 *", value: manualPerformance, set: setManualPerformance, placeholder: "例：今天主動提問很多，過去式動詞錯了幾次...", rows: 3, required: true },
                { label: "本課重點單字（逗號分隔）", value: manualVocab, set: setManualVocab, placeholder: "例：camouflage, predator, ancient", rows: 1 },
                { label: "本課重點片語（逗號分隔）", value: manualPhrases, set: setManualPhrases, placeholder: "例：set off, travel light", rows: 1 },
                { label: "需要加強的地方", value: manualErrors, set: setManualErrors, placeholder: "例：過去式動詞用錯 4 次", rows: 2 },
                { label: "下堂課建議", value: manualNextFocus, set: setManualNextFocus, placeholder: "例：練習過去式口說", rows: 2 },
                { label: "老師手記（給學生看）", value: note, set: setNote, placeholder: "給學生的話", rows: 2 },
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
              <Btn kind="ghost" size="sm" onClick={onClose} disabled={busy}>關閉</Btn>
              <Btn kind="gold" size="sm" onClick={handleManualGenerate} disabled={!manualPerformance.trim() || busy}>
                {busy ? "生成中…" : "生成報告"}
              </Btn>
            </div>
          </>
        )}

        {/* ── Step 2: 確認詞彙 ── */}
        {step === "vocab" && (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: "#EAF0F6", color: C.navy }}>
              以下是 AI 從逐字稿中找到的重點詞彙，請確認後生成報告。可以刪除不需要的，也可以補充 AI 遺漏的。
            </div>

            {/* 單字 */}
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: C.muted }}>
                本課單字 ({words.length})
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {words.map((w, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ background: "#EAF0F6", color: C.navy }}>
                    {w}
                    <button onClick={() => removeWord(i)} className="ml-0.5 hover:text-red-500 transition">×</button>
                  </span>
                ))}
                {words.length === 0 && (
                  <span className="text-xs" style={{ color: C.muted }}>AI 未找到符合條件的單字</span>
                )}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newWord} onChange={e => setNewWord(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addWord()}
                  placeholder="補充單字…" className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: C.line, color: C.text }} />
                <Btn kind="ghost" size="sm" onClick={addWord} disabled={!newWord.trim()}>新增</Btn>
              </div>
            </div>

            {/* 片語 */}
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: C.muted }}>
                本課片語 ({phrases.length})
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
                  <span className="text-xs" style={{ color: C.muted }}>AI 未找到符合條件的片語</span>
                )}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newPhrase} onChange={e => setNewPhrase(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPhrase()}
                  placeholder="補充片語…" className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: C.line, color: C.text }} />
                <Btn kind="ghost" size="sm" onClick={addPhrase} disabled={!newPhrase.trim()}>新增</Btn>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: C.red }}>{errorMsg}</div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>AI 生成報告中，約需 30–60 秒…</span>}
              <Btn kind="ghost" size="sm" onClick={() => setStep("upload")} disabled={busy}>← 返回</Btn>
              <Btn kind="gold" size="sm" onClick={handleGenerate} disabled={busy}>
                {busy ? "生成中…" : "確認並生成報告"}
              </Btn>
            </div>
          </>
        )}

        {/* ── 完成 ── */}
        {step === "done" && (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: "#E8F5E9", color: C.green }}>
              報告已生成，學生已收到通知。
            </div>
            <div className="flex justify-end">
              <Btn kind="gold" size="sm" onClick={onClose}>關閉</Btn>
            </div>
          </>
        )}

        {/* ── 錯誤 ── */}
        {step === "error" && (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF2F2", color: C.red }}>
              發生錯誤，請再試一次。{errorMsg ? `（${errorMsg}）` : ""}
            </div>
            <div className="flex justify-end gap-2">
              <Btn kind="ghost" size="sm" onClick={onClose}>關閉</Btn>
              <Btn kind="gold" size="sm" onClick={() => setStep("upload")}>重試</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
