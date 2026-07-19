'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { C } from '@/lib/constants'

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/students', label: 'My Students' },
  { href: '/reports', label: 'Reports' },
]

export function Nav({ teacherName }: { teacherName: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-50 border-b"
      style={{ background: C.navy, borderColor: 'rgba(255,255,255,0.1)' }}>
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="flex h-[56px] items-center justify-between">
          {/* Logo */}
          <div className="font-serif text-[18px] font-medium text-white">
            Bridgeway <span style={{ color: C.gold }}>Teachers</span>
          </div>

          {/* Links */}
          <div className="hidden sm:flex items-center gap-1">
            {links.map(l => (
              <a key={l.href} href={l.href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition"
                style={{
                  background: pathname === l.href ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: pathname === l.href ? '#fff' : 'rgba(255,255,255,0.6)',
                }}>
                {l.label}
              </a>
            ))}
          </div>

          {/* 老師名字 + 登出 */}
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {teacherName}
            </span>
            <button onClick={handleSignOut}
              className="text-xs px-3 py-1.5 rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
              登出
            </button>
          </div>
        </div>

        {/* Mobile links */}
        <div className="flex sm:hidden gap-1 pb-2">
          {links.map(l => (
            <a key={l.href} href={l.href}
              className="flex-1 text-center py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: pathname === l.href ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: pathname === l.href ? '#fff' : 'rgba(255,255,255,0.5)',
              }}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}
