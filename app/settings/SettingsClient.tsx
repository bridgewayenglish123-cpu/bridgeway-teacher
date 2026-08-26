"use client"
import { useState, useTransition } from 'react'
import { C } from '@/lib/constants'

export function SettingsClient({ teacher }: {
  teacher: { id: string; teacher_name: string; zoom_url: string | null }
}) {
  const [zoomUrl, setZoomUrl] = useState(teacher.zoom_url ?? '')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    startTransition(async () => {
      const res = await fetch('/api/settings/zoom-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoomUrl }),
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

      {/* Zoom 連結 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold" style={{ color: C.navy }}>Zoom Meeting Link</h2>
          <p className="text-[13px] mt-1" style={{ color: C.muted }}>
            Your permanent Zoom link. This will be included in lesson reminder emails sent to students.
          </p>
        </div>

        <input
          type="url"
          value={zoomUrl}
          onChange={e => setZoomUrl(e.target.value)}
          placeholder="https://zoom.us/j/your-meeting-id"
          className="w-full rounded-xl border px-3 py-2.5 text-[14px] outline-none transition mb-3"
          style={{ borderColor: C.line, color: C.navy }}
        />

        {zoomUrl && (
          <div className="mb-3 text-[12px] px-3 py-2 rounded-xl"
            style={{ background: '#EEF2FF', color: '#3730A3' }}>
            🔗 {zoomUrl}
          </div>
        )}

        {error && (
          <div className="mb-3 text-[12px] px-3 py-2 rounded-xl"
            style={{ background: '#FEF2F2', color: '#DC2626' }}>
            {error}
          </div>
        )}

        <button onClick={handleSave} disabled={isPending || !zoomUrl.trim()}
          className="rounded-xl px-5 py-2.5 text-[13px] font-semibold transition disabled:opacity-40"
          style={{ background: C.navy, color: '#fff' }}>
          {isPending ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </main>
  )
}
