"use client"
import { useState, useTransition } from 'react'
import { C } from '@/lib/constants'

export function SettingsClient({ teacher }: {
  teacher: { id: string; teacher_name: string; zoom_url: string | null; zoom_meeting_id: string | null; zoom_password: string | null }
}) {
  const [zoomUrl, setZoomUrl] = useState(teacher.zoom_url ?? '')
  const [zoomMeetingId, setZoomMeetingId] = useState(teacher.zoom_meeting_id ?? '')
  const [zoomPassword, setZoomPassword] = useState(teacher.zoom_password ?? '')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    startTransition(async () => {
      const res = await fetch('/api/settings/zoom-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoomUrl, zoomMeetingId, zoomPassword }),
      })
      const data = await res.json()
      if (data.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        setError(data.error ?? 'Failed to save')
      }
    })
  }

  return (
    <main className="mx-auto max-w-[600px] px-4 py-6 sm:px-8 sm:py-8 pb-24 sm:pb-8"
      style={{ background: '#F7F4EE', minHeight: '100dvh' }}>

      <h1 className="font-serif text-[28px] font-medium mb-6" style={{ color: C.navy }}>
        Settings
      </h1>

      <div className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: C.navy }}>Zoom Settings</h2>
          <p className="text-[13px] mt-1" style={{ color: C.muted }}>
            Your Zoom details will be included in lesson reminder emails sent to students.
          </p>
        </div>

        {/* Zoom 連結 */}
        <div>
          <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
            Personal Meeting Link
          </label>
          <input type="url" value={zoomUrl} onChange={e => setZoomUrl(e.target.value)}
            placeholder="https://zoom.us/j/your-meeting-id"
            className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
            style={{ borderColor: C.line, color: C.navy }} />
        </div>

        {/* 會議 ID */}
        <div>
          <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
            Meeting ID
          </label>
          <input type="text" value={zoomMeetingId} onChange={e => setZoomMeetingId(e.target.value)}
            placeholder="e.g. 123 456 7890"
            className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
            style={{ borderColor: C.line, color: C.navy }} />
        </div>

        {/* 會議密碼 */}
        <div>
          <label className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
            Meeting Password <span style={{ fontWeight: 400 }}>(if required)</span>
          </label>
          <input type="text" value={zoomPassword} onChange={e => setZoomPassword(e.target.value)}
            placeholder="e.g. 123456"
            className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
            style={{ borderColor: C.line, color: C.navy }} />
        </div>

        {/* 預覽 */}
        {(zoomUrl || zoomMeetingId) && (
          <div className="rounded-xl p-3 text-[12px] space-y-1"
            style={{ background: '#EEF2FF', color: '#3730A3' }}>
            <div>🔗 {zoomUrl || '（未填連結）'}</div>
            {zoomMeetingId && <div>📋 Meeting ID：{zoomMeetingId}</div>}
            {zoomPassword && <div>🔑 Password：{zoomPassword}</div>}
          </div>
        )}

        {error && (
          <div className="text-[12px] px-3 py-2 rounded-xl"
            style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</div>
        )}

        <button onClick={handleSave} disabled={isPending}
          className="rounded-xl px-5 py-2.5 text-[13px] font-semibold transition disabled:opacity-40"
          style={{ background: C.navy, color: '#fff' }}>
          {isPending ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </main>
  )
}
