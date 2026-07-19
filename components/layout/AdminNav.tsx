'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { C } from '@/lib/constants'

const links = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/teachers', label: 'Teachers' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/reports', label: 'Reports' },
]

export function AdminNav({ adminName }: { adminName: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <>
      <nav className="hidden sm:block sticky top-0 z-50 border-b"
        style={{ background: '#0F2440', borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <div className="flex h-[56px] items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="font-serif text-[18px] font-medium text-white">
                Bridgeway <span style={{ color: C.gold }}>Admin</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: C.gold, color: '#0F2440' }}>ADMIN</span>
            </div>
            <div className="flex items-center gap-1">
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
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{adminName}</span>
              <button onClick={handleSignOut}
                className="text-xs px-3 py-1.5 rounded-lg transition"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>
      <div className="sm:hidden sticky top-0 z-50 flex h-[52px] items-center justify-between px-4"
        style={{ background: '#0F2440' }}>
        <div className="font-serif text-[16px] font-medium text-white">
          Bridgeway <span style={{ color: C.gold }}>Admin</span>
        </div>
        <button onClick={handleSignOut} className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
          Sign Out
        </button>
      </div>
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t"
        style={{ background: '#fff', borderColor: C.line }}>
        {links.map(l => {
          const active = pathname === l.href
          return (
            <a key={l.href} href={l.href}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5"
              style={{ color: active ? C.navy : C.muted }}>
              <span className="text-[10px] font-medium">{l.label}</span>
            </a>
          )
        })}
      </nav>
      <div className="sm:hidden h-[60px]" />
    </>
  )
}
