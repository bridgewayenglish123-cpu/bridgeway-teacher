'use client'
import { useState, useTransition } from 'react'
import { C } from '@/lib/constants'

type Teacher = {
  id: string
  teacher_name: string
  teacher_type: string
  active_status: string
  email: string | null
  auth_user_id: string | null
  portal_password_hint: string | null
  role: string
}

export function AdminTeachersClient({ teachers }: { teachers: Teacher[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'no-portal'>('all')
  const [selected, setSelected] = useState<Teacher | null>(null)

  const filtered = teachers.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !q || t.teacher_name.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)
    const matchFilter = filter === 'all' ? true :
      filter === 'active' ? t.active_status === 'Active' :
      !t.auth_user_id
    return matchSearch && matchFilter
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  const openModal = (t: Teacher) => {
    setSelected(t)
    setEmail(t.email ?? '')
    setPassword('')
    setStatus('idle')
    setErrorMsg('')
  }

  const handleCreate = () => {
    if (!selected || !email || !password) return
    startTransition(async () => {
      setStatus('loading')
      const res = await fetch('/api/teacher-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: selected.id, email, password, teacherName: selected.teacher_name, action: 'create' }),
      })
      const data = await res.json()
      if (data.error) { setErrorMsg(data.error); setStatus('error') }
      else { setStatus('done') }
    })
  }

  const handleReset = () => {
    if (!selected || !password) return
    startTransition(async () => {
      setStatus('loading')
      const res = await fetch('/api/teacher-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: selected.id, authUserId: selected.auth_user_id, password, action: 'reset' }),
      })
      const data = await res.json()
      if (data.error) { setErrorMsg(data.error); setStatus('error') }
      else { setStatus('done') }
    })
  }

  const handleDelete = () => {
    if (!selected?.auth_user_id) return
    if (!confirm(`Delete portal account for ${selected.teacher_name}?`)) return
    startTransition(async () => {
      setStatus('loading')
      const res = await fetch('/api/teacher-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: selected.id, authUserId: selected.auth_user_id, action: 'delete' }),
      })
      const data = await res.json()
      if (data.error) { setErrorMsg(data.error); setStatus('error') }
      else { setStatus('done') }
    })
  }

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-serif text-[28px] font-medium" style={{ color: C.navy }}>Teachers</h1>
        <span className="text-sm" style={{ color: C.muted }}>{filtered.length} teachers</span>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="Search by name or email..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="rounded-xl border px-4 py-2 text-sm outline-none flex-1 min-w-[180px]"
          style={{ borderColor: C.line, color: C.navy }} />
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EDE9E0' }}>
          {(['all', 'active', 'no-portal'] as const).map(v => (
            <button key={v} onClick={() => setFilter(v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition"
              style={{ background: filter === v ? C.navy : 'transparent', color: filter === v ? '#fff' : C.muted }}>
              {v === 'all' ? `All (${teachers.length})` : v === 'active' ? 'Active' : 'No Portal'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map(t => (
          <div key={t.id} className="rounded-2xl bg-white p-4 sm:p-5 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ background: t.active_status === 'Active' ? C.navy : C.muted }}>
              {t.teacher_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold" style={{ color: C.navy }}>{t.teacher_name}</div>
              <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                {t.email ?? 'No email'}
                {t.portal_password_hint && (
                  <span className="ml-2 font-mono" style={{ color: C.gold }}>pw: {t.portal_password_hint}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {t.auth_user_id ? (
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                  Portal Active
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#FFF8E1', color: '#F57F17' }}>
                  No Portal
                </span>
              )}
              <button onClick={() => openModal(t)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: '#EDE9E0', color: C.navy }}>
                {t.auth_user_id ? 'Manage' : 'Set Up'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(10,30,54,0.55)' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-4 shadow-2xl">
            <h3 className="font-semibold text-base" style={{ color: C.navy }}>
              {selected.auth_user_id ? `Manage: ${selected.teacher_name}` : `Set Up Portal: ${selected.teacher_name}`}
            </h3>

            {status === 'done' ? (
              <>
                <div className="rounded-lg p-3 text-sm" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                  Done! Please refresh the page.
                </div>
                <button onClick={() => setSelected(null)}
                  className="w-full py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: C.navy }}>Close</button>
              </>
            ) : (
              <>
                {!selected.auth_user_id && (
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>Email *</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: C.line }} placeholder="teacher@example.com" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>
                    {selected.auth_user_id ? 'New Password' : 'Password *'}
                  </label>
                  <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none font-mono"
                    style={{ borderColor: C.line }} placeholder="min. 8 characters" />
                  {selected.portal_password_hint && (
                    <div className="text-xs mt-1" style={{ color: C.muted }}>
                      Current: <span className="font-mono" style={{ color: C.gold }}>{selected.portal_password_hint}</span>
                    </div>
                  )}
                </div>

                {status === 'error' && (
                  <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', color: C.red }}>
                    {errorMsg}
                  </div>
                )}

                <div className="flex gap-2">
                  {selected.auth_user_id ? (
                    <>
                      <button onClick={handleDelete} disabled={isPending}
                        className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                        style={{ background: '#FEF2F2', color: C.red }}>
                        Delete
                      </button>
                      <button onClick={handleReset} disabled={!password || password.length < 8 || isPending}
                        className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: C.navy }}>
                        {status === 'loading' ? 'Saving…' : 'Reset Password'}
                      </button>
                    </>
                  ) : (
                    <button onClick={handleCreate} disabled={!email || !password || password.length < 8 || isPending}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: C.navy }}>
                      {status === 'loading' ? 'Creating…' : 'Create Account'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
