"use client"
import { useState, useTransition } from 'react'
import { C } from '@/lib/constants'

type Lesson = {
  id: string
  date: string
  time: string | null
  duration: number | null
  student: { zh_name: string; en_name: string | null } | null
}

interface Props {
  lesson: Lesson
  teacherName: string
  onClose: () => void
  onSubmitted: () => void
}

export function LessonChangeRequestModal({ lesson, teacherName, onClose, onSubmitted }: Props) {
  const [type, setType] = useState<'leave' | 'reschedule'>('leave')
  const [reason, setReason] = useState('')
  const [discussed, setDiscussed] = useState<boolean | null>(null)
  const [suggestedDate, setSuggestedDate] = useState('')
  const [suggestedTime, setSuggestedTime] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const studentName = Array.isArray(lesson.student)
    ? (lesson.student[0]?.en_name ?? lesson.student[0]?.zh_name)
    : (lesson.student?.en_name ?? lesson.student?.zh_name) ?? 'Student'

  const canSubmit = discussed !== null &&
    (type === 'leave' || (discussed ? (suggestedDate && suggestedTime) : true))

  const handleSubmit = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const res = await fetch('/api/lesson-change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: lesson.id,
          type,
          reason,
          discussed,
          suggestedDate: discussed ? suggestedDate : null,
          suggestedTime: discussed ? suggestedTime : null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        onSubmitted()
      } else {
        setError(data.error ?? 'Failed to submit. Please try again.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(26,34,54,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.line }}>
          <div>
            <div className="font-semibold text-[15px]" style={{ color: C.navy }}>Report a Change</div>
            <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>
              {studentName} · {lesson.date} {lesson.time ? lesson.time.slice(0, 5) : ''}
            </div>
          </div>
          <button onClick={onClose} className="text-[20px] leading-none" style={{ color: C.muted }}>×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 類型 */}
          <div>
            <label className="text-[12px] font-semibold mb-2 block" style={{ color: C.muted }}>
              Request Type
            </label>
            <div className="flex gap-2">
              {([
                { v: 'leave', l: '🙏 Leave' },
                { v: 'reschedule', l: '📅 Reschedule' },
              ] as const).map(t => (
                <button key={t.v} onClick={() => setType(t.v)}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-medium border transition"
                  style={{
                    background: type === t.v ? C.navy : 'transparent',
                    color: type === t.v ? '#fff' : C.muted,
                    borderColor: type === t.v ? C.navy : C.line,
                  }}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>

          {/* 原因 */}
          <div>
            <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
              Reason <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder="e.g. I have a medical appointment"
              className="w-full rounded-xl border px-3 py-2 text-[13px] resize-none outline-none"
              style={{ borderColor: C.line, color: C.navy }} />
          </div>

          {/* 是否已跟學生討論 */}
          <div>
            <label className="text-[12px] font-semibold mb-2 block" style={{ color: C.muted }}>
              Have you discussed this with the student?
            </label>
            <div className="flex gap-2">
              {([
                { v: true, l: '✅ Yes' },
                { v: false, l: '❌ No — please help me' },
              ] as const).map(d => (
                <button key={String(d.v)} onClick={() => setDiscussed(d.v)}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-medium border transition"
                  style={{
                    background: discussed === d.v ? (d.v ? '#E8F5E9' : '#FEF3C7') : 'transparent',
                    color: discussed === d.v ? (d.v ? '#2E7D32' : '#92400E') : C.muted,
                    borderColor: discussed === d.v ? (d.v ? '#A5D6A7' : '#FDE68A') : C.line,
                  }}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>

          {/* 已討論 → 填新時間 */}
          {discussed === true && type === 'reschedule' && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: '#F7F4EE', border: `1px solid ${C.line}` }}>
              <div className="text-[12px] font-semibold" style={{ color: C.muted }}>Suggested New Time</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: C.muted }}>Date</label>
                  <input type="date" value={suggestedDate} onChange={e => setSuggestedDate(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                    style={{ borderColor: C.line, color: C.navy }} />
                </div>
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: C.muted }}>Time</label>
                  <input type="time" value={suggestedTime} onChange={e => setSuggestedTime(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                    style={{ borderColor: C.line, color: C.navy }} />
                </div>
              </div>
            </div>
          )}

          {/* 未討論 → 說明 */}
          {discussed === false && (
            <div className="rounded-xl px-4 py-3 text-[12px] leading-relaxed"
              style={{ background: '#FEF3C7', color: '#92400E' }}>
              Lee will help coordinate with the student. You'll be notified once a new time is confirmed.
            </div>
          )}

          {error && (
            <div className="text-[12px] rounded-lg px-3 py-2" style={{ background: '#FEF2F2', color: '#DC2626' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-between" style={{ borderColor: C.line }}>
          <button onClick={onClose} className="text-[13px] font-medium px-4 py-2 rounded-xl border transition"
            style={{ borderColor: C.line, color: C.muted }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit || isPending}
            className="text-[13px] font-semibold px-5 py-2 rounded-xl transition disabled:opacity-40"
            style={{ background: C.navy, color: '#fff' }}>
            {isPending ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}
