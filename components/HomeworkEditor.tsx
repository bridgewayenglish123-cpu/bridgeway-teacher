'use client'

import { useState } from 'react'
import { C } from '@/lib/constants'

const MAX_TRANSLATE = 5

// 老師端 homework 編輯:改英文 → 存 → 後端翻譯中文。
// 有次數上限(5次),達上限完全鎖死。改前跳確認彈窗提醒剩餘次數。
export function HomeworkEditor({ reportId, initialEn, initialCount }: {
  reportId: string
  initialEn: string | null
  initialCount: number
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [value, setValue] = useState(initialEn ?? '')
  const [saved, setSaved] = useState(initialEn ?? '')
  const [count, setCount] = useState(initialCount)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locked = count >= MAX_TRANSLATE
  const remaining = MAX_TRANSLATE - count

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/update-homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, homeworkEn: value }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setSaved(value.trim())
        if (typeof d?.translateCount === 'number') setCount(d.translateCount)
        setEditing(false)
      } else {
        setError(typeof d?.error === 'string' ? d.error : 'Save failed')
        if (d?.locked) setCount(MAX_TRANSLATE)
      }
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  // 點 Edit:先跳確認彈窗(內容有變才會消耗次數,這裡提醒)
  const startEdit = () => {
    setValue(saved)
    setConfirming(true)
  }

  return (
    <div className="rounded-xl p-4" style={{ background: '#F0FDF4', border: '1px solid rgba(22,101,52,0.25)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#166534' }}>Homework</div>
        {!editing && !locked && (
          <button onClick={startEdit}
            className="text-[11px] px-2.5 py-1 rounded-md font-medium"
            style={{ background: '#fff', color: '#166534', border: '1px solid rgba(22,101,52,0.3)' }}>
            Edit
          </button>
        )}
        {locked && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#FEE2E2', color: '#991B1B' }}>
            Edit limit reached
          </span>
        )}
      </div>

      {/* 確認彈窗 */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-[15px] font-semibold mb-2" style={{ color: C.navy }}>Edit homework?</h3>
            <p className="text-[13px] leading-[1.7] mb-1" style={{ color: C.muted }}>
              Homework can be edited a limited number of times. Editing the text will use one of your remaining edits and re-translate the Chinese.
            </p>
            <p className="text-[13px] font-semibold mb-4" style={{ color: remaining <= 1 ? C.red : '#166534' }}>
              {remaining} edit{remaining === 1 ? '' : 's'} remaining
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirming(false)}
                className="text-[13px] px-4 py-2 rounded-lg font-medium"
                style={{ background: '#fff', color: C.muted, border: `1px solid ${C.line}` }}>
                Cancel
              </button>
              <button onClick={() => { setConfirming(false); setEditing(true) }}
                className="text-[13px] px-4 py-2 rounded-lg font-medium"
                style={{ background: '#166534', color: '#fff' }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {editing ? (
        <div>
          <textarea value={value} onChange={e => setValue(e.target.value)} rows={3}
            placeholder="Homework in English. Chinese is generated automatically on save."
            className="w-full rounded-lg border px-3 py-2 text-[13px] resize-none outline-none"
            style={{ borderColor: C.line, color: C.navy, background: '#fff' }} />
          <div className="text-[11px] mt-1.5" style={{ color: C.muted }}>
            Your English is kept exactly. Chinese is re-translated when you save. {remaining} edit{remaining === 1 ? '' : 's'} left.
          </div>
          {error && <div className="text-[11px] mt-1" style={{ color: C.red }}>{error}</div>}
          <div className="flex gap-2 mt-2">
            <button onClick={handleSave} disabled={saving}
              className="text-[12px] px-3 py-1.5 rounded-md font-medium"
              style={{ background: '#166534', color: '#fff', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setError(null) }} disabled={saving}
              className="text-[12px] px-3 py-1.5 rounded-md font-medium"
              style={{ background: '#fff', color: C.muted, border: `1px solid ${C.line}` }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        saved
          ? <p className="text-[13px] leading-[1.8] whitespace-pre-line" style={{ color: C.navy }}>{saved}</p>
          : <p className="text-[12px]" style={{ color: C.muted }}>{locked ? 'No homework.' : 'No homework. Click Edit to add one.'}</p>
      )}
    </div>
  )
}
