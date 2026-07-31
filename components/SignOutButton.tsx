'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function SignOutButton({ label = 'Sign out' }: { label?: string }) {
  const router = useRouter()
  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }
  return (
    <button
      onClick={handleSignOut}
      className="mt-5 px-5 py-2 rounded-lg text-[13px] font-medium transition"
      style={{ background: '#1A3A5C', color: '#fff' }}>
      {label}
    </button>
  )
}
