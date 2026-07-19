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
  const label = { idle: 'Generate Report', uploading: 'Uploading…', analyzing: '生成中…', done: '完成', error: 'Retry' }

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
        <h3 className="text-base font-semibold" style={{ color: C.navy }}>Generate AI Lesson Report</h3>

        <div className="flex gap-1 rounded-lg p-1" style={{ background: '#EAF0F6' }}>
          {(['vtt', 'manual'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} disabled={busy}
              className="flex-1 rounded-md py-1.5 text-xs font-semibold transition"
              style={{ background: mode === m ? C.navy : 'transparent', color: mode === m ? '#fff' : C.muted }}>
              {m === 'vtt' ? 'Upload VTT (AI)' : 'Manual Entry'}
            </button>
          ))}
        </div>

        <div className="rounded-lg px-3 py-2.5 text-sm space-y-0.5" style={{ background: '#EAF0F6', color: C.navy }}>
          <div><span style={{ color: C.muted }}>Student: </span>{studentName}</div>
          <div><span style={{ color: C.muted }}>Date: </span>{lessonDate}</div>
          <div><span style={{ color: C.muted }}>Teacher: </span>{teacherName}</div>
        </div>

        {status === 'done' ? (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: '#E8F5E9', color: C.green }}>
              Report generated. Student has been notified.
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: C.navy, color: '#fff' }}>Close</button>
            </div>
          </>
        ) : mode === 'vtt' ? (
          <>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>Teacher's Note (optional)</label>
              <textarea className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.line, color: C.navy, minHeight: 72, resize: 'vertical' }}
                placeholder="Any special observations from this lesson?" value={note}
                onChange={e => setNote(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>
                VTT Transcript File <span style={{ color: C.red }}>*</span>
              </label>
              <input type="file" accept=".vtt" className="w-full text-sm"
                onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
              {file && <div className="text-xs mt-1" style={{ color: C.muted }}>{file.name}</div>}
            </div>
            {status === 'error' && (
              <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', color: C.red }}>
                An error occurred.{errorMsg ? `（${errorMsg}）` : 'Please try again.'}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>
                {status === 'uploading' ? 'Uploading…' : 'AI analyzing, ~30–60 seconds…'}
              </span>}
              <button onClick={onClose} disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: C.line, color: C.muted }}>Close</button>
              <button onClick={handleVttSubmit} disabled={!file || busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: C.navy }}>{label[status]}</button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              {[
                { label: 'Student Performance *', value: manualPerformance, set: setManualPerformance, placeholder: 'e.g. Asked many questions today, made several past tense errors...', required: true, rows: 4 },
                { label: 'Key Vocabulary (comma separated)', value: manualVocab, set: setManualVocab, placeholder: 'e.g. camouflage, predator, ancient', rows: 1 },
                { label: 'Key Phrases (comma separated)', value: manualPhrases, set: setManualPhrases, placeholder: 'e.g. set off, travel light', rows: 1 },
                { label: 'Areas to Improve', value: manualErrors, set: setManualErrors, placeholder: 'e.g. Past tense errors x4, incomplete comparisons', rows: 2 },
                { label: 'Next Lesson Focus', value: manualNextFocus, set: setManualNextFocus, placeholder: 'e.g. Practice past tense in speaking', rows: 2 },
                { label: "Teacher Note (shown to student)", value: note, set: setNote, placeholder: 'A note for the student...', rows: 2 },
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
                An error occurred.{errorMsg ? `（${errorMsg}）` : 'Please try again.'}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              {busy && <span className="text-xs mr-auto" style={{ color: C.muted }}>AI generating, ~30–60 seconds…</span>}
              <button onClick={onClose} disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: C.line, color: C.muted }}>Close</button>
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
