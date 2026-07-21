'use client'
import { useState, useMemo } from 'react'
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

export function ReportsClient({ reports, teacherName }: { reports: Report[]; teacherName: string }) {
  const [search, setSearch] = useState('')
  const [selectedStudentName, setSelectedStudentName] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [mobileView, setMobileView] = useState<View>('students')
  const [reuploadTarget, setReuploadTarget] = useState<{
    lessonId: string; lessonDate: string; studentName: string; reportId: string
  } | null>(null)

  const getLesson = (r: Report) => Array.isArray(r.lesson) ? r.lesson[0] : r.lesson
  const getStudent = (r: Report) => {
    const l = getLesson(r)
    return l ? (Array.isArray(l.student) ? l.student[0] : l.student) : null
  }
  const getStudentKey = (r: Report) => {
    const s = getStudent(r)
    return s?.en_name ?? s?.zh_name ?? '—'
  }

  const studentList = useMemo(() => {
    const map = new Map<string, { name: string; zhName: string; latestDate: string; count: number }>()
    for (const r of reports) {
      const s = getStudent(r)
      const l = getLesson(r)
      const key = s?.en_name ?? s?.zh_name ?? '—'
      const date = l?.date ?? r.created_at.slice(0, 10)
      const existing = map.get(key)
      if (!existing || date > existing.latestDate) {
        map.set(key, { name: s?.en_name ?? s?.zh_name ?? '—', zhName: s?.zh_name ?? '', latestDate: date, count: (existing?.count ?? 0) + 1 })
      } else { existing.count++ }
    }
    return Array.from(map.values())
      .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.zhName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate))
  }, [reports, search])

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

  const selectStudent = (name: string) => {
    setSelectedStudentName(name)
    setSelectedReport(null)
    setMobileView('reports')
  }

  const selectReport = (r: Report) => {
    setSelectedReport(r)
    setMobileView('detail')
  }

  const ReportDetail = ({ report }: { report: Report }) => {
    const lesson = getLesson(report)
    const student = getStudent(report)
    const analysis = report.analysis_en ?? report.analysis_zh
    const lessonId = lesson?.id ?? ''
    const studentName = student?.en_name ?? student?.zh_name ?? 'Student'

    return (
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b" style={{ borderColor: C.line }}>
          <button className="sm:hidden text-sm mb-2" style={{ color: C.navy }}
            onClick={() => setMobileView('reports')}>← Back</button>
          <div className="text-xs mb-1" style={{ color: C.muted }}>
            {lesson?.date} · {lesson?.duration} min
          </div>
          <div className="font-serif text-[18px] font-semibold leading-snug mb-3" style={{ color: C.navy }}>
            {analysis?.headline ?? '—'}
          </div>

          {/* 操作按鈕 */}
          <div className="flex items-center gap-2 flex-wrap">

            <button
              onClick={() => {
                if (!lesson) return
                setReuploadTarget({
                  lessonId: lesson.id,
                  lessonDate: lesson.date,
                  studentName,
                  reportId: report.id,
                })
              }}
              className="text-[12px] px-3 py-1.5 rounded-xl font-medium transition hover:opacity-80"
              style={{ background: C.gold, color: '#fff' }}>
              Regenerate Report
            </button>
          </div>

          {report.milestone && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: '#FBF8EF', color: C.gold, border: '1px solid rgba(194,153,47,0.3)' }}>
              🏆 {report.milestone}
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-5">
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
                  <li key={i} className="border-l-[3px] border-yellow-400 pl-3 text-[13px] leading-[1.7]" style={{ color: C.navy }}>
                    {s.en ?? s.zh}
                  </li>
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
                    <div className="font-semibold text-[13px] mb-1" style={{ color: C.navy }}>
                      {e.pattern_en ?? e.pattern} {e.count ? `× ${e.count}` : ''}
                    </div>
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
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>
                Vocabulary ({report.vocabulary.length})
              </div>
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
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: C.gold }}>Next Lesson Focus</div>
              <p className="text-[13px] leading-[1.75]" style={{ color: C.navy }}>{report.next_focus}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 52px)' }}>
      <div className="flex flex-1 overflow-hidden">
        {/* Col 1: Student List */}
        <div className={`${mobileView === 'students' ? 'flex' : 'hidden'} sm:flex flex-col border-r`}
          style={{ width: '100%', maxWidth: 220, borderColor: C.line, minWidth: 0 }}>
          <div className="p-3 border-b" style={{ borderColor: C.line }}>
            <div className="text-[13px] font-semibold mb-2 px-1" style={{ color: C.navy }}>Reports</div>
            <input type="text" placeholder="Search student..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: C.line, color: C.navy }} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {studentList.map(s => {
              const active = selectedStudentName === s.name
              return (
                <button key={s.name} onClick={() => selectStudent(s.name)}
                  className="w-full text-left px-4 py-3 transition-colors"
                  style={{
                    background: active ? '#EDE9E0' : 'transparent',
                    borderLeft: active ? `3px solid ${C.navy}` : '3px solid transparent',
                  }}>
                  <div className="font-medium text-sm" style={{ color: C.navy }}>{s.name}</div>
                  {s.zhName && s.zhName !== s.name && (
                    <div className="text-xs" style={{ color: C.muted }}>{s.zhName}</div>
                  )}
                  <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                    {s.count} report{s.count > 1 ? 's' : ''} · {s.latestDate.slice(5)}
                  </div>
                </button>
              )
            })}
            {studentList.length === 0 && (
              <div className="p-4 text-xs text-center" style={{ color: C.muted }}>No students found.</div>
            )}
          </div>
        </div>

        {/* Col 2: Report List */}
        <div className={`${mobileView === 'reports' ? 'flex' : 'hidden'} sm:flex flex-col border-r`}
          style={{ width: '100%', maxWidth: 260, borderColor: C.line, minWidth: 0 }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: C.line }}>
            <button className="sm:hidden text-sm" style={{ color: C.navy }}
              onClick={() => setMobileView('students')}>←</button>
            <span className="text-sm font-semibold" style={{ color: C.navy }}>
              {selectedStudentName ?? 'Select a student'}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {studentReports.map(r => {
              const lesson = getLesson(r)
              const active = selectedReport?.id === r.id
              const analysis = r.analysis_en ?? r.analysis_zh
              return (
                <button key={r.id} onClick={() => selectReport(r)}
                  className="w-full text-left px-4 py-3 border-b transition-colors"
                  style={{
                    background: active ? '#EDE9E0' : 'transparent',
                    borderLeftWidth: 3, borderLeftStyle: 'solid',
                    borderLeftColor: active ? C.gold : 'transparent',
                    borderBottomColor: C.line,
                  }}>
                  <div className="text-sm font-medium mb-0.5" style={{ color: C.navy }}>{lesson?.date ?? '—'}</div>
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
        </div>

        {/* Col 3: Report Detail */}
        <div className={`${mobileView === 'detail' ? 'flex' : 'hidden'} sm:flex flex-col flex-1`} style={{ minWidth: 0 }}>
          {selectedReport ? (
            <ReportDetail report={selectedReport} />
          ) : (
            <div className="hidden sm:flex items-center justify-center flex-1 text-sm" style={{ color: C.muted }}>
              ← Select a report
            </div>
          )}
        </div>
      </div>

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
