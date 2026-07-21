'use client'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { C } from '@/lib/constants'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊟' },
  { href: '/lessons', label: 'Lessons', icon: '◈' },
  { href: '/students', label: 'Students', icon: '◉' },
  { href: '/reports', label: 'Reports', icon: '◫' },
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
    <>
      {/* 桌機頂部 Nav */}
      <nav className="hidden sm:block sticky top-0 z-50 border-b"
        style={{ background: '#F7F4EE', borderColor: 'rgba(26,34,54,0.08)' }}>
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="flex h-[56px] items-center justify-between">
            {/* 品牌 */}
            <div className="font-serif text-[18px] font-medium" style={{ color: C.navy }}>
              Bridgeway <span style={{ color: C.gold }}>Teacher</span>
            </div>

            {/* 導航連結 */}
            <div className="flex items-center gap-1">
              {links.map(l => {
                const active = pathname === l.href
                return (
                  <Link key={l.href} href={l.href}
                    className="px-4 py-2 rounded-xl text-[13px] font-medium transition"
                    style={{
                      background: active ? C.navy : 'transparent',
                      color: active ? '#F7F4EE' : C.muted,
                    }}>
                    {l.label}
                  </Link>
                )
              })}
            </div>

            {/* 老師名 + Sign Out */}
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-medium" style={{ color: C.navy }}>{teacherName}</span>
              <button onClick={handleSignOut}
                className="text-[12px] px-3 py-1.5 rounded-xl transition hover:opacity-80"
                style={{ background: 'rgba(26,34,54,0.06)', color: C.muted }}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 手機頂部 */}
      <div className="sm:hidden sticky top-0 z-50 flex h-[52px] items-center justify-between px-4 border-b"
        style={{ background: '#F7F4EE', borderColor: 'rgba(26,34,54,0.08)' }}>
        <div className="font-serif text-[16px] font-medium" style={{ color: C.navy }}>
          Bridgeway <span style={{ color: C.gold }}>Teacher</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: C.muted }}>{teacherName}</span>
          <button onClick={handleSignOut}
            className="text-[11px] px-2.5 py-1.5 rounded-xl"
            style={{ background: 'rgba(26,34,54,0.06)', color: C.muted }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* 手機底部 Tab Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t"
        style={{ background: '#F7F4EE', borderColor: 'rgba(26,34,54,0.08)' }}>
        {links.map(l => {
          const active = pathname === l.href
          return (
            <Link key={l.href} href={l.href}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition"
              style={{ color: active ? C.navy : C.muted }}>
              <span className="text-[16px]">{l.icon}</span>
              <span className="text-[10px] font-medium">{l.label}</span>
              {active && (
                <span className="absolute bottom-0 w-6 h-[2px] rounded-full"
                  style={{ background: C.gold }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* 手機底部佔位 */}
      <div className="sm:hidden h-[60px]" />
    </>
  )
}
