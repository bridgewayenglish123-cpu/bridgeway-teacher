'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/constants'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Incorrect email or password. Please try again.')
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: C.bg }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-serif text-[28px] font-medium mb-1" style={{ color: C.navy }}>
            Bridgeway <span style={{ color: C.gold }}>Teacher</span>
          </div>
          <div className="text-sm" style={{ color: C.muted }}>Teacher Portal</div>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6 space-y-4 shadow-md" style={{ background: C.card }}>
          <h1 className="text-lg font-semibold" style={{ color: C.navy }}>Sign In</h1>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              style={{ borderColor: C.line, color: C.text }}
              placeholder="your@email.com"
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>密碼</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              style={{ borderColor: C.line, color: C.text }}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>

          {error && (
            <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF2F2', color: C.red }}>
              {error}
            </div>
          )}

          <button onClick={handleLogin} disabled={loading || !email || !password}
            className="w-full rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-50"
            style={{ background: C.navy, color: '#fff' }}>
            {loading ? 'Sign In中…' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}
