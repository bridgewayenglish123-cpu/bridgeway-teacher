'use client'
import { useState, useMemo, useEffect } from 'react'
import { C } from '@/lib/constants'
import { UploadReportModal } from '@/components/UploadReportModal'

type Report = {
  id: string
  created_at: string
  milestone: string | null
  teacher_note?: string | null
  analysis_zh: { headline: string; body: string } | null
  analysis_en: { headline: string; body: string } | null
  vocabulary: { word: string; definition_en?: string; definition_zh?: string }[] | null
  phrases: { phrase: string; usage_en?: string }[] | null
  strengths: { zh: string; en?: string }[] | null
  errors: { pattern?: string; pattern_en?: string; pattern_zh?: string; count?: number; example?: string; correction?: string; tip_en?: string }[] | null
  next_focus: string | null
  lesson: { id: string; date: string; time: string | null; duration: number | null; student: { zh_name: string; en_name: string | null } | null } | null
}

type View = 'students' | 'reports' | 'detail'
type DisplayMode = 'overview' | 'by-student'

const REPORTS_PAGE_SIZE = 10

export function ReportsClient({ reports, teacherName }: { reports: Report[]; teacherName: string }) {
  const [mode, setMode] = useState<DisplayMode>('overview')
  const [search, setSearch] = useState('')
  const [filterNote, setFilterNote] = useState<'all' | 'no-note'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alpha'>('newest')
  const [selectedStudentName, setSelectedStudentName] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [mobileView, setMobileView] = useState<View>('students')
  const [reportsPage, setReportsPage] = useState(1)
  const [reuploadTarget, setReuploadTarget] = useState<{
    lessonId: string; lessonDate: string; studentName: string; reportId: string
  } | null>(null)
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  // Overview page
  const [overviewPage, setOverviewPage] = useState(1)
  const OVERVIEW_PAGE_SIZE = 20

  const getLesson = (r: Report) => Array.isArray(r.lesson) ? r.lesson[0] : r.lesson
  const getStudent = (r: Report) => {
    const l = getLesson(r)
    return l ? (Array.isArray(l.student) ? l.student[0] : l.student) : null
  }
  const getStudentKey = (r: Report) => {
    const s = getStudent(r)
    return s?.en_name ?? s?.zh_name ?? '—'
  }

  // ── Overview: all reports flat list ──
  const overviewFiltered = useMemo(() => {
    let list = [...reports]
    if (filterNote === 'no-note') list = list.filter(r => !r.teacher_note)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        const s = getStudent(r)
        const l = getLesson(r)
        return s?.en_name?.toLowerCase().includes(q) ||
          s?.zh_name?.toLowerCase().includes(q) ||
          l?.date?.includes(q) ||
          (r.analysis_en ?? r.analysis_zh)?.headline?.toLowerCase().includes(q)
      })
    }
    list.sort((a, b) => {
      const da = getLesson(a)?.date ?? a.created_at
      const db = getLesson(b)?.date ?? b.created_at
      return sortBy === 'oldest' ? da.localeCompare(db) : db.localeCompare(da)
    })
    return list
  }, [reports, search, filterNote, sortBy])

  useEffect(() => { setOverviewPage(1) }, [search, filterNote, sortBy])

  const overviewTotalPages = Math.ceil(overviewFiltered.length / OVERVIEW_PAGE_SIZE)
  const overviewPaginated = overviewFiltered.slice((overviewPage - 1) * OVERVIEW_PAGE_SIZE, overviewPage * OVERVIEW_PAGE_SIZE)

  // ── By Student ──
  const studentList = useMemo(() => {
    const map = new Map<string, { name: string; zhName: string; latestDate: string; count: number; noNoteCount: number }>()
    for (const r of reports) {
      const s = getStudent(r)
      const l = getLesson(r)
      const key = s?.en_name ?? s?.zh_name ?? '—'
      const date = l?.date ?? r.created_at.slice(0, 10)
      const existing = map.get(key)
      const noNote = !r.teacher_note ? 1 : 0
      if (!existing || date > existing.latestDate) {
        map.set(key, { name: key, zhName: s?.zh_name ?? '', latestDate: date, count: (existing?.count ?? 0) + 1, noNoteCount: (existing?.noNoteCount ?? 0) + noNote })
      } else {
        existing.count++
        existing.noNoteCount += noNote
      }
    }
    let list = Array.from(map.values())
    if (filterNote === 'no-note') list = list.filter(s => s.noNoteCount > 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.zhName.toLowerCase().includes(q))
    }
    if (sortBy === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name))
    else list.sort((a, b) => b.latestDate.localeCompare(a.latestDate))
    return list
  }, [reports, search, filterNote, sortBy])

  const studentReports = useMemo(() => {
    if (!selectedStudentName) return []
    return reports
      .filter(r => getStudentKey(r) === selectedStudentName)
      .sort((a, b) => {
        const da = getLesson(a)?.date ?? a.created_at
        const db = getLesson(b)?.date ?? b.created_at
        return db.localeCompare(da)
      })
  }, [reports, selectedStudentName])

  useEffect(() => { setReportsPage(1) }, [selectedStudentName])
  const reportsTotalPages = Math.ceil(studentReports.length / REPORTS_PAGE_SIZE)
  const reportsPaginated = studentReports.slice((reportsPage - 1) * REPORTS_PAGE_SIZE, reportsPage * REPORTS_PAGE_SIZE)

  const selectStudent = (name: string) => { setSelectedStudentName(name); setSelectedReport(null); setMobileView('reports') }
  const selectReport = (r: Report) => { setSelectedReport(r); setMobileView('detail') }

  // No-note counts
  const totalNoNote = reports.filter(r => !r.teacher_note).length

  // ── Report Detail ──
  const ReportDetail = ({ report }: { report: Report }) => {
    const lesson = getLesson(report)
    const student = getStudent(report)
    const analysis = report.analysis_en ?? report.analysis_zh
    const lessonId = lesson?.id ?? ''
    const studentName = student?.en_name ?? student?.zh_name ?? 'Student'

    return (
      <div className="h-full overflow-y-auto">
        <div className="px-5 py-4 border-b" style={{ borderColor: C.line }}>
          <button className="sm:hidden text-sm mb-2" style={{ color: C.navy }} onClick={() => setMobileView('reports')}>← Back</button>
          <div className="text-xs mb-1" style={{ color: C.muted }}>{lesson?.date} · {lesson?.duration} min</div>
          <div className="font-serif text-[18px] font-semibold leading-snug mb-3" style={{ color: C.navy }}>
            {analysis?.headline ?? '—'}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { if (!lesson) return; setReuploadTarget({ lessonId: lesson.id, lessonDate: lesson.date, studentName, reportId: report.id }) }}
              className="text-[12px] px-3 py-1.5 rounded-xl font-medium transition hover:opacity-80"
              style={{ background: C.gold, color: '#fff' }}>
              Regenerate Report
            </button>
            {/* Teacher Note indicator */}
            {report.teacher_note ? (
              <span className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ background: '#E8F5E9', color: '#2E7D32' }}>✓ Note added</span>
            ) : (
              <span className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ background: '#FEF3C7', color: '#92400E' }}>No note yet</span>
            )}
          </div>
          {report.milestone && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: '#FBF8EF', color: C.gold, border: '1px solid rgba(194,153,47,0.3)' }}>
              🏆 {report.milestone}
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Teacher Note */}
          <div className="rounded-xl p-4" style={{ background: '#F7F4EE', border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>Teacher Note</div>
              {editingNote !== report.id ? (
                <button onClick={() => { setEditingNote(report.id); setNoteText(report.teacher_note ?? '') }}
                  className="text-[11px] px-2.5 py-1 rounded-lg transition hover:opacity-80"
                  style={{ background: '#EDE9E0', color: C.navy }}>
                  {report.teacher_note ? 'Edit' : '+ Add Note'}
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button onClick={() => setEditingNote(null)} className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: '#EDE9E0', color: C.muted }}>Cancel</button>
                  <button disabled={noteSaving}
                    onClick={async () => {
                      setNoteSaving(true)
                      await fetch('/api/teacher-note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId: report.id, note: noteText }) })
                      report.teacher_note = noteText
                      setEditingNote(null)
                      setNoteSaving(false)
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-50" style={{ background: C.navy, color: '#fff' }}>
                    {noteSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            {editingNote === report.id ? (
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                placeholder="Write a note for this student..."
                className="w-full rounded-lg border px-3 py-2 text-[13px] resize-none outline-none"
                style={{ borderColor: C.line, color: C.navy, background: '#fff' }} />
            ) : report.teacher_note ? (
              <p className="text-[13px] leading-relaxed" style={{ color: C.navy }}>{report.teacher_note}</p>
            ) : (
              <p className="text-[12px]" style={{ color: C.muted }}>No note yet. Click to add one.</p>
            )}
          </div>

          {analysis?.body && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Summary</div>
              <p className="text-[14px] leading-[1.85]" style={{ color: C.navy }}>{analysis.body}</p>
            </div>
          )}
          {report.strengths && report.strengths.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>What They Did Well</div>
              <ul className="space-y-2">
                {report.strengths.map((s, i) => (
                  <li key={i} className="border-l-[3px] border-yellow-400 pl-3 text-[13px] leading-[1.7]" style={{ color: C.navy }}>{s.en ?? s.zh}</li>
                ))}
              </ul>
            </div>
          )}
          {report.errors && report.errors.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Areas to Improve</div>
              <ul className="space-y-4">
                {report.errors.map((e, i) => (
                  <li key={i} className="border-l-[3px] pl-3" style={{ borderColor: C.line }}>
                    <div className="font-semibold text-[13px] mb-1" style={{ color: C.navy }}>{e.pattern_en ?? e.pattern} {e.count ? `× ${e.count}` : ''}</div>
                    {e.example && <div className="text-[12px] line-through" style={{ color: C.muted }}>{e.example}</div>}
                    {e.correction && <div className="text-[13px] font-semibold" style={{ color: C.navy }}>{e.correction}</div>}
                    {e.tip_en && <div className="text-[12px] mt-1" style={{ color: C.muted }}>{e.tip_en}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.vocabulary && report.vocabulary.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>Vocabulary ({report.vocabulary.length})</div>
              <div className="grid grid-cols-2 gap-2">
                {report.vocabulary.map((v, i) => (
                  <div key={i} className="rounded-xl px-3 py-2" style={{ background: '#F7F4EE' }}>
                    <div className="font-semibold text-[13px]" style={{ color: C.navy }}>{v.word}</div>
                    {v.definition_en && <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{v.definition_en}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {report.next_focus && (
            <div className="rounded-xl p-4" style={{ background: '#FBF8EF', border: '1px solid rgba(194,153,47,0.3)' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: C.gold }}>Next Lesson Focus</div>
              <ul className="space-y-2">
                {report.next_focus
                  .split(/\n/)
                  .map(s => s.trim().replace(/^[\d]+[.)\s]+/, '').replace(/^[•·\-]\s*/, ''))
                  .filter(s => s.length > 5)
                  .map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] leading-[1.7]" style={{ color: C.navy }}>
                      <span className="flex-shrink-0 mt-[3px] w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ background: C.gold, color: '#fff' }}>{i + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ── Mode toggle + global filters ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-wrap" style={{ borderColor: C.line, background: '#F7F4EE' }}>
        {/* Mode */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EDE9E0' }}>
          {([{ v: 'overview', l: 'Overview' }, { v: 'by-student', l: 'By Student' }] as const).map(m => (
            <button key={m.v} onClick={() => setMode(m.v)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
              style={{ background: mode === m.v ? C.navy : 'transparent', color: mode === m.v ? '#fff' : C.muted }}>
              {m.l}
            </button>
          ))}
        </div>

        {/* Search */}
        <input type="text" placeholder="Search student or date..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] rounded-xl border px-3 py-1.5 text-[13px] outline-none"
          style={{ borderColor: C.line, color: C.navy }} />

        {/* Filter: no note */}
        <button onClick={() => setFilterNote(f => f === 'no-note' ? 'all' : 'no-note')}
          className="text-[12px] px-3 py-1.5 rounded-xl font-medium border transition"
          style={{
            background: filterNote === 'no-note' ? '#FEF3C7' : '#fff',
            color: filterNote === 'no-note' ? '#92400E' : C.muted,
            borderColor: filterNote === 'no-note' ? '#FDE68A' : C.line,
          }}>
          No Note {totalNoNote > 0 && `(${totalNoNote})`}
        </button>

        {/* Sort */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#EDE9E0' }}>
          {([{ v: 'newest', l: 'Newest' }, { v: 'oldest', l: 'Oldest' }, { v: 'alpha', l: 'A–Z' }] as const).map(s => (
            <button key={s.v} onClick={() => setSortBy(s.v)}
              className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition"
              style={{ background: sortBy === s.v ? C.navy : 'transparent', color: sortBy === s.v ? '#fff' : C.muted }}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW MODE ── */}
      {mode === 'overview' && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 text-[12px]" style={{ color: C.muted }}>
            {overviewFiltered.length} reports{filterNote === 'no-note' ? ' without Teacher Note' : ''}
          </div>
          <div className="px-4 pb-4 flex flex-col gap-2">
            {overviewPaginated.map(r => {
              const lesson = getLesson(r)
              const student = getStudent(r)
              const analysis = r.analysis_en ?? r.analysis_zh
              const hasNote = !!r.teacher_note
              return (
                <button key={r.id} onClick={() => { setSelectedReport(r); setSelectedStudentName(getStudentKey(r)); setMode('by-student'); setMobileView('detail') }}
                  className="w-full text-left rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md flex items-center gap-3"
                  style={{ borderLeft: `3px solid ${hasNote ? C.green : '#FDE68A'}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-[14px]" style={{ color: C.navy }}>
                        {student?.en_name ?? student?.zh_name ?? '—'}
                      </span>
                      <span className="text-[12px]" style={{ color: C.muted }}>{lesson?.date}</span>
                      {!hasNote && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: '#FEF3C7', color: '#92400E' }}>No Note</span>
                      )}
                    </div>
                    <div className="text-[13px] truncate" style={{ color: C.muted }}>{analysis?.headline ?? '—'}</div>
                  </div>
                  <span style={{ color: C.muted }}>›</span>
                </button>
              )
            })}
            {overviewPaginated.length === 0 && (
              <div className="py-12 text-center text-[13px]" style={{ color: C.muted }}>No reports found.</div>
            )}
          </div>

          {/* Overview pagination */}
          {overviewTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 pb-4">
              <button onClick={() => setOverviewPage(p => Math.max(1, p - 1))} disabled={overviewPage === 1}
                className="px-4 py-2 rounded-xl text-[13px] font-medium disabled:opacity-40"
                style={{ background: '#fff', color: C.navy, border: `1px solid ${C.line}` }}>← Previous</button>
              <span className="text-[12px]" style={{ color: C.muted }}>Page {overviewPage} of {overviewTotalPages}</span>
              <button onClick={() => setOverviewPage(p => Math.min(overviewTotalPages, p + 1))} disabled={overviewPage === overviewTotalPages}
                className="px-4 py-2 rounded-xl text-[13px] font-medium disabled:opacity-40"
                style={{ background: '#fff', color: C.navy, border: `1px solid ${C.line}` }}>Next →</button>
            </div>
          )}
        </div>
      )}

      {/* ── BY STUDENT MODE ── */}
      {mode === 'by-student' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Col 1: Student List */}
          <div className={`${mobileView === 'students' ? 'flex' : 'hidden'} sm:flex flex-col border-r`}
            style={{ width: '100%', maxWidth: 220, borderColor: C.line, minWidth: 0 }}>
            <div className="flex-1 overflow-y-auto">
              {studentList.map(s => {
                const active = selectedStudentName === s.name
                return (
                  <button key={s.name} onClick={() => selectStudent(s.name)}
                    className="w-full text-left px-4 py-3 transition-colors border-b"
                    style={{ background: active ? '#EDE9E0' : 'transparent', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: active ? C.navy : 'transparent', borderBottomColor: C.line }}>
                    <div className="font-medium text-sm" style={{ color: C.navy }}>{s.name}</div>
                    {s.zhName && s.zhName !== s.name && <div className="text-xs" style={{ color: C.muted }}>{s.zhName}</div>}
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="text-xs" style={{ color: C.muted }}>{s.count} report{s.count > 1 ? 's' : ''}</div>
                      {s.noNoteCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#FEF3C7', color: '#92400E' }}>{s.noNoteCount} no note</span>
                      )}
                    </div>
                  </button>
                )
              })}
              {studentList.length === 0 && <div className="p-4 text-xs text-center" style={{ color: C.muted }}>No students found.</div>}
            </div>
          </div>

          {/* Col 2: Report List */}
          <div className={`${mobileView === 'reports' ? 'flex' : 'hidden'} sm:flex flex-col border-r`}
            style={{ width: '100%', maxWidth: 260, borderColor: C.line, minWidth: 0 }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: C.line }}>
              <button className="sm:hidden text-sm" style={{ color: C.navy }} onClick={() => setMobileView('students')}>←</button>
              <span className="text-sm font-semibold truncate" style={{ color: C.navy }}>{selectedStudentName ?? 'Select a student'}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {reportsPaginated.map(r => {
                const lesson = getLesson(r)
                const active = selectedReport?.id === r.id
                const analysis = r.analysis_en ?? r.analysis_zh
                const hasNote = !!r.teacher_note
                return (
                  <button key={r.id} onClick={() => selectReport(r)}
                    className="w-full text-left px-4 py-3 border-b transition-colors"
                    style={{ background: active ? '#EDE9E0' : 'transparent', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: active ? C.gold : 'transparent', borderBottomColor: C.line }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="text-sm font-medium" style={{ color: C.navy }}>{lesson?.date ?? '—'}</div>
                      {!hasNote && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }}>No Note</span>}
                      {hasNote && <span className="text-[10px]" style={{ color: C.green }}>✓</span>}
                    </div>
                    <div className="text-xs line-clamp-2" style={{ color: C.muted }}>{analysis?.headline ?? '—'}</div>
                  </button>
                )
              })}
              {studentReports.length === 0 && selectedStudentName && (
                <div className="p-4 text-xs text-center" style={{ color: C.muted }}>No reports yet.</div>
              )}
              {!selectedStudentName && (
                <div className="p-4 text-xs text-center hidden sm:block" style={{ color: C.muted }}>← Select a student</div>
              )}
            </div>
            {/* Col 2 pagination */}
            {reportsTotalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: C.line }}>
                <button onClick={() => setReportsPage(p => Math.max(1, p - 1))} disabled={reportsPage === 1}
                  className="text-[11px] px-2.5 py-1 rounded-lg disabled:opacity-40"
                  style={{ background: '#EDE9E0', color: C.navy }}>←</button>
                <span className="text-[11px]" style={{ color: C.muted }}>{reportsPage}/{reportsTotalPages}</span>
                <button onClick={() => setReportsPage(p => Math.min(reportsTotalPages, p + 1))} disabled={reportsPage === reportsTotalPages}
                  className="text-[11px] px-2.5 py-1 rounded-lg disabled:opacity-40"
                  style={{ background: '#EDE9E0', color: C.navy }}>→</button>
              </div>
            )}
          </div>

          {/* Col 3: Report Detail */}
          <div className={`${mobileView === 'detail' ? 'flex' : 'hidden'} sm:flex flex-col flex-1`} style={{ minWidth: 0 }}>
            {selectedReport ? (
              <ReportDetail report={selectedReport} />
            ) : (
              <div className="hidden sm:flex items-center justify-center flex-1 text-sm" style={{ color: C.muted }}>← Select a report</div>
            )}
          </div>
        </div>
      )}

      {/* Reupload Modal */}
      {reuploadTarget && (
        <UploadReportModal
          lessonId={reuploadTarget.lessonId}
          lessonDate={reuploadTarget.lessonDate}
          studentName={reuploadTarget.studentName}
          teacherName={teacherName}
          existingReportId={reuploadTarget.reportId}
          onGenerated={() => setReuploadTarget(null)}
          onClose={() => setReuploadTarget(null)}
        />
      )}
    </div>
  )
}
