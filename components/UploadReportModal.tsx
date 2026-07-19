'use client'
import { useState } from 'react'
import { C } from '@/lib/constants'

type Mode = 'vtt' | 'manual'
type Status = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'

export function UploadReportModal({
  lessonId, studentName, lessonDate, teacherName,
  existingReportId, onGenerated, onClose,
}: {
  lessonId: string
  studentName: string
  lessonDate: string
  teacherName: string
  existingReportId?: string
  onGenerated: () => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>('vtt')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [manualPerformance, setManualPerformance] = useState('')
  const [manualVocab, setManualVocab] = useState('')
  const [manualPhrases, setManualPhrases] = useState('')
  const [manualErrors, setManualErrors] = useState('')
  const [manualNextFocus, setManualNextFocus] = useState('')

  const busy = status === 'uploading' || status === 'analyzing'
  const label = { idle: '生成報告', uploading: '上傳中…', analyzing: '生成中…', done: '完成', error: '重試' }

  const handleVttSubmit = async () => {
    if (!file) return
    setErrorMsg(null)
    try {
      setStatus('uploading')
      const vttContent = await file.text()
      setStatus('analyzing')
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, vttContent, teacherNote: note.trim() || undefined, existingReportId }),
      })
      if (res.ok) { setStatus('done'); onGenerated() }
      else {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(typeof data?.error === 'string' ? data.error : null)
        setStatus('error')
      }
    } catch { setStatus('error') }
  }

  const handleManualSubmit = async () => {
    if (!manualPerformance.trim()) return
    setErrorMsg(null)
    try {
      setStatus('analyzing')
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId, existingReportId,
          manualInput: {
            performance: manualPerformance, vocabulary: manualVocab,
            phrases: manualPhrases, errors: manualErrors,
            nextFocus: manualNextFocus, teacherNote: note,
          },
        }),
      })
      if (res.ok) { setStatus('done'); onGenerated() }
      else {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(typeof data?.error === 'string' ? data.error : null)
        setStatus('error')
      }
    } catch { setStatus('error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,30,54,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="w-full max-w-md rounded-2xl p-5 space-y-4 overflow-y-auto max-h-[90vh] bg-white shadow-2xl">
        <h3 className="text-base font-semibold" style={{ color: C.navy }}>生成 AI 學習報告</h3>

        <div className="flex gap-1 rounded-lg p-1" style={{ background: '#EAF0F6' }}>
          {(['vtt', 'manual'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} disabled={busy}
              className="flex-1 rounded-md py-1.5 text-xs font-semibold transition"
              style={{ background: mode === m ? C.navy : 'transparent', color: mode === m ? '#fff' : C.muted }}>
              {m === 'vtt' ? '上傳 VTT（AI 生成）' : '手動填寫'}
            </button>
          ))}
        </div>

        <div className="rounded-lg px-3 py-2.5 text-sm space-y-0.5" style={{ background: '#EAF0F6', color: C.navy }}>
          <div><span style={{ color: C.muted }}>學生：</span>{studentName}</div>
          <div><span style={{ color: C.muted }}>日期：</span>{lessonDate}</div>
          <div><span style={{ color: C.muted }}>老師：</span>{teacherName}</div>
        </div>

        {status === 'done' ? (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: '#E8F5E9', color: C.green }}>
              報告已生成，學生已收到通知。
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: C.navy, color: '#fff' }}>關閉</button>
            </div>
          </>
        ) : mode === 'vtt' ? (
          <>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>老師手記（選填）</label>
              <textarea className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.line, color: C.navy, minHeight: 72, resize: 'vertical' }}
                placeholder="這堂課有什麼特別的觀察？" value={note}
                onChange={e => setNote(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>
                VTT 轉錄檔 <span style={{ color: C.red }}>*</span>
              </label>
              <input type="file" accept=".vtt" className="w-full text-sm"
                onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
              {file && <div className="text-xs mt-1" style={{ color: C.muted }}>{file.name}</div>}
            </div>
            {status === 'error' && (
              <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', color: C.red }}>
                發生錯誤。{errorMsg ? `（${errorMsg}）` : '請再試一次。'}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>
                {status === 'uploading' ? '上傳中…' : 'AI 分析中，約需 30–60 秒…'}
              </span>}
              <button onClick={onClose} disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: C.line, color: C.muted }}>關閉</button>
              <button onClick={handleVttSubmit} disabled={!file || busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: C.navy }}>{label[status]}</button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              {[
                { label: '學生課堂表現 *', value: manualPerformance, set: setManualPerformance, placeholder: '例：今天主動提問很多，過去式動詞錯了幾次...', required: true, rows: 4 },
                { label: '本課重點單字（逗號分隔）', value: manualVocab, set: setManualVocab, placeholder: '例：camouflage, predator, ancient', rows: 1 },
                { label: '本課重點片語（逗號分隔）', value: manualPhrases, set: setManualPhrases, placeholder: '例：set off, travel light', rows: 1 },
                { label: '需要加強的地方', value: manualErrors, set: setManualErrors, placeholder: '例：過去式動詞用錯 4 次', rows: 2 },
                { label: '下堂課建議', value: manualNextFocus, set: setManualNextFocus, placeholder: '例：練習過去式口說', rows: 2 },
                { label: '老師手記（給學生看）', value: note, set: setNote, placeholder: '給學生的話', rows: 2 },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>{f.label}</label>
                  {f.rows === 1 ? (
                    <input type="text" value={f.value} onChange={e => f.set(e.target.value)} disabled={busy}
                      placeholder={f.placeholder}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: C.line, color: C.navy }} />
                  ) : (
                    <textarea value={f.value} onChange={e => f.set(e.target.value)} disabled={busy}
                      placeholder={f.placeholder} rows={f.rows}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
                      style={{ borderColor: C.line, color: C.navy }} />
                  )}
                </div>
              ))}
            </div>
            {status === 'error' && (
              <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', color: C.red }}>
                發生錯誤。{errorMsg ? `（${errorMsg}）` : '請再試一次。'}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>AI 生成中，約需 30–60 秒…</span>}
              <button onClick={onClose} disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: C.line, color: C.muted }}>關閉</button>
              <button onClick={handleManualSubmit} disabled={!manualPerformance.trim() || busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: C.navy }}>{label[status]}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
