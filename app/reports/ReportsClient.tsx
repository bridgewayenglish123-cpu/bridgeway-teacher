'use client'
import { useState, useMemo } from 'react'
import { C } from '@/lib/constants'

type Report = {
  id: string
  created_at: string
  milestone: string | null
  analysis_zh: { headline: string; body: string } | null
  analysis_en: { headline: string; body: string } | null
  vocabulary: { word: string; definition_en?: string; definition_zh?: string }[] | null
  phrases: { phrase: string; usage_en?: string }[] | null
  strengths: { zh: string; en?: string }[] | null
  errors: { pattern?: string; pattern_en?: string; pattern_zh?: string; count?: number; example?: string; correction?: string; tip_en?: string }[] | null
  next_focus: string | null
  lesson: { id: string; date: string; time: string | null; duration: number | null; student: { zh_name: string; en_name: string | null } | null } | null
}

export function ReportsClient({ reports, teacherName }: { reports: Report[]; teacherName: string }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Report | null>(null)

  const filtered = useMemo(() => {
    if (!search) return reports
    const q = search.toLowerCase()
    return reports.filter(r => {
      const lesson = Array.isArray(r.lesson) ? r.lesson[0] : r.lesson
      const s = lesson ? (Array.isArray(lesson.student) ? lesson.student[0] : lesson.student) : null
      return s?.zh_name?.toLowerCase().includes(q) || s?.en_name?.toLowerCase().includes(q)
    })
  }, [reports, search])

  return (
    <main className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-[28px] font-medium" style={{ color: C.navy }}>Reports</h1>
        <span className="text-sm" style={{ color: C.muted }}>{filtered.length} reports</span>
      </div>

      <input type="text" placeholder="Search by student name..."
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none mb-5"
        style={{ borderColor: C.line, color: C.navy }} />

      <div className="flex flex-col gap-3">
        {filtered.map(r => {
          const lesson = Array.isArray(r.lesson) ? r.lesson[0] : r.lesson
          const student = lesson ? (Array.isArray(lesson.student) ? lesson.student[0] : lesson.student) : null
          const analysis = r.analysis_en ?? r.analysis_zh
          return (
            <div key={r.id} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm border-l-[3px] border-yellow-400">
              <div className="flex-shrink-0 text-center w-12">
                <div className="text-[11px]" style={{ color: C.muted }}>{lesson?.date?.slice(5,7)}</div>
                <div className="font-serif text-[22px] font-medium" style={{ color: C.navy }}>{lesson?.date?.slice(8)}</div>
              </div>
              <div className="w-px self-stretch" style={{ background: C.line }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px]" style={{ color: C.navy }}>
                  {student?.en_name ? `${student.en_name} (${student.zh_name})` : student?.zh_name ?? '—'}
                </div>
                {analysis?.headline && (
                  <div className="text-[13px] mt-0.5 line-clamp-1" style={{ color: C.muted }}>
                    {analysis.headline}
                  </div>
                )}
              </div>
              <button onClick={() => setSelected(r)}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition hover:opacity-80"
                style={{ background: '#EAF0F6', color: C.navy }}>
                View
              </button>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: C.muted }}>No reports found.</div>
        )}
      </div>

      {/* Report Detail Modal */}
      {selected && (() => {
        const lesson = Array.isArray(selected.lesson) ? selected.lesson[0] : selected.lesson
        const student = lesson ? (Array.isArray(lesson.student) ? lesson.student[0] : lesson.student) : null
        const analysis = selected.analysis_en ?? selected.analysis_zh
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(10,30,54,0.55)' }}
            onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
            <div className="w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto sm:rounded-2xl bg-white shadow-2xl">
              {/* Header */}
              <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b"
                style={{ background: C.navy, borderColor: 'rgba(255,255,255,0.1)' }}>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {lesson?.date} · {student?.en_name ?? student?.zh_name} · {lesson?.duration} min
                  </div>
                  <div className="text-[15px] font-semibold text-white">{analysis?.headline}</div>
                </div>
                <button onClick={() => setSelected(null)} className="text-white/60 hover:text-white text-lg">✕</button>
              </div>

              <div className="p-6 space-y-5">
                {/* Summary */}
                {analysis?.body && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Summary</div>
                    <p className="text-[15px] leading-[1.8]" style={{ color: C.navy }}>{analysis.body}</p>
                  </div>
                )}

                {/* Strengths */}
                {selected.strengths && selected.strengths.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>What They Did Well</div>
                    <ul className="space-y-2">
                      {selected.strengths.map((s, i) => (
                        <li key={i} className="border-l-[3px] border-yellow-400 pl-4 text-[14px] leading-[1.7]" style={{ color: C.navy }}>
                          {s.en ?? s.zh}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Errors */}
                {selected.errors && selected.errors.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Areas to Improve</div>
                    <ul className="space-y-4">
                      {selected.errors.map((e, i) => (
                        <li key={i} className="border-l-[3px] pl-4" style={{ borderColor: C.line }}>
                          <div className="font-semibold text-[14px] mb-1" style={{ color: C.navy }}>
                            {e.pattern_en ?? e.pattern} {e.count ? `× ${e.count}` : ''}
                          </div>
                          {e.example && <div className="text-[13px] line-through" style={{ color: C.muted }}>{e.example}</div>}
                          {e.correction && <div className="text-[14px] font-semibold" style={{ color: C.navy }}>{e.correction}</div>}
                          {e.tip_en && <div className="text-[13px] mt-1" style={{ color: C.muted }}>{e.tip_en}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Vocabulary */}
                {selected.vocabulary && selected.vocabulary.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Vocabulary ({selected.vocabulary.length})</div>
                    <div className="grid grid-cols-2 gap-2">
                      {selected.vocabulary.map((v, i) => (
                        <div key={i} className="rounded-xl px-3 py-2" style={{ background: '#F5F7FA' }}>
                          <div className="font-semibold text-[14px]" style={{ color: C.navy }}>{v.word}</div>
                          {v.definition_en && <div className="text-[12px] mt-0.5" style={{ color: C.muted }}>{v.definition_en}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next Focus */}
                {selected.next_focus && (
                  <div className="rounded-xl p-4" style={{ background: '#FBF8EF', border: '1px solid rgba(194,153,47,0.3)' }}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#C2991F' }}>Next Lesson Focus</div>
                    <p className="text-[14px] leading-[1.75]" style={{ color: C.navy }}>{selected.next_focus}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </main>
  )
}
