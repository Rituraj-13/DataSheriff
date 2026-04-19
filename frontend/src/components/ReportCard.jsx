import { useState } from 'react'
import './ReportCard.css'

const SEVERITY_CLASS = {
  Critical: 'severity--critical',
  High:     'severity--high',
  Medium:   'severity--medium',
  Low:      'severity--low',
}

function Field({ label, value, mono = false }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="report-field">
      <span className="report-field__label">{label}</span>
      <span className={`report-field__value${mono ? ' mono' : ''}`}>{String(value)}</span>
    </div>
  )
}

export default function ReportCard({ report }) {
  const [copied, setCopied] = useState(false)

  if (!report) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const severityClass = SEVERITY_CLASS[report.severity] ?? 'severity--medium'

  return (
    <div className="report-card animate-fade-up">

      {/* ── Header ── */}
      <div className="report-card__header">
        <div className="report-card__header-left">
          <span className="report-card__icon">📋</span>
          <div>
            <h2 className="report-card__title">Incident Report</h2>
            <p className="report-card__subtitle">Root cause identified by DataSheriff</p>
          </div>
        </div>
        <div className="report-card__header-right">
          {report.severity && (
            <span className={`severity-badge ${severityClass}`}>{report.severity}</span>
          )}
          <button
            id="copy-report-btn"
            className="report-card__copy-btn"
            onClick={handleCopy}
            aria-label="Copy incident report as JSON"
          >
            {copied ? '✓ Copied!' : '⎘ Copy JSON'}
          </button>
        </div>
      </div>

      {/* ── Root Cause highlight ── */}
      {report.root_cause && (
        <div className="report-card__root-cause">
          <div className="report-card__root-cause-label">🔴 Root Cause</div>
          <div className="report-card__root-cause-text">{report.root_cause}</div>
        </div>
      )}

      {/* ── Field grid ── */}
      <div className="report-card__fields">
        <Field label="Affected Asset"   value={report.affected_asset}   mono />
        <Field label="Root Cause Asset" value={report.root_cause_asset} mono />
        <Field label="Owner"            value={report.owner} />
        <Field label="Owner Email"      value={report.owner_email} />
        <Field label="Failure Time"     value={report.failure_time} />
        <Field label="Evidence"         value={report.evidence} />
      </div>

      {/* ── Lineage path ── */}
      {Array.isArray(report.lineage_path) && report.lineage_path.length > 0 && (
        <div className="report-card__section">
          <div className="report-card__section-title">🕸️ Lineage Path</div>
          <div className="report-card__lineage-path">
            {report.lineage_path.map((node, i) => (
              <span key={i} className="lineage-path-item">
                <span className="lineage-path-node">{node}</span>
                {i < report.lineage_path.length - 1 && (
                  <span className="lineage-path-arrow" aria-hidden="true">→</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Failing tests ── */}
      {Array.isArray(report.failing_tests) && report.failing_tests.length > 0 && (
        <div className="report-card__section">
          <div className="report-card__section-title">🧪 Failing Tests</div>
          <div className="report-card__tests">
            {report.failing_tests.map((t, i) => (
              <div key={i} className="report-test-row">
                <span className="badge badge--danger">{t.status || 'Failed'}</span>
                <span className="report-test-name">{t.test}</span>
                <span className="report-test-table">{t.table}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recommended action ── */}
      {report.recommended_action && (
        <div className="report-card__action">
          <span className="report-card__action-icon" aria-hidden="true">⚡</span>
          <div>
            <div className="report-card__action-label">Recommended Action</div>
            <div className="report-card__action-text">{report.recommended_action}</div>
          </div>
        </div>
      )}
    </div>
  )
}
