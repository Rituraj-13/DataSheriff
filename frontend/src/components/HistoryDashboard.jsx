/**
 * HistoryDashboard.jsx
 * Shows all past investigations, MTTR stats, severity breakdown,
 * and time saved vs industry average.
 */

import { useState } from 'react'
import './HistoryDashboard.css'

const SEVERITY_COLOR = {
    Critical: { bg: '#FCEBEB', text: '#791F1F', dot: '#E24B4A' },
    High: { bg: '#FEF3E2', text: '#7C4A00', dot: '#EF9F27' },
    Medium: { bg: '#FAEEDA', text: '#633806', dot: '#D97706' },
    Low: { bg: '#E1F5EE', text: '#085041', dot: '#1D9E75' },
    Unknown: { bg: '#F0F0F8', text: '#555577', dot: '#9898B8' },
    Error: { bg: '#F0F0F8', text: '#555577', dot: '#9898B8' },
}

function formatDuration(sec) {
    if (sec == null) return '—'
    if (sec < 60) return `${sec}s`
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}m ${s}s`
}

function formatTime(ts) {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function StatCard({ icon, value, label, sub, accent }) {
    return (
        <div className={`hist-stat-card ${accent ? 'hist-stat-card--accent' : ''}`}>
            <span className="hist-stat-card__icon">{icon}</span>
            <div className="hist-stat-card__value">{value}</div>
            <div className="hist-stat-card__label">{label}</div>
            {sub && <div className="hist-stat-card__sub">{sub}</div>}
        </div>
    )
}

function SeverityBadge({ severity }) {
    const c = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.Unknown
    return (
        <span className="hist-severity-badge" style={{ background: c.bg, color: c.text }}>
            <span className="hist-severity-dot" style={{ background: c.dot }} />
            {severity ?? 'Unknown'}
        </span>
    )
}

export default function HistoryDashboard({ history, stats, onClear, onReplay }) {
    const [expandedId, setExpandedId] = useState(null)

    if (!history.length) {
        return (
            <div className="hist-empty">
                <div className="hist-empty__icon">📭</div>
                <h3 className="hist-empty__title">No investigations yet</h3>
                <p className="hist-empty__desc">
                    Run your first investigation and the results will appear here.
                    Every investigation is automatically saved with timing data.
                </p>
            </div>
        )
    }

    return (
        <div className="hist-dashboard animate-fade-up">

            {/* ── Stats row ── */}
            {stats && (
                <div className="hist-stats-grid">
                    <StatCard
                        icon="⚡"
                        value={formatDuration(stats.avgMttr)}
                        label="Avg MTTR"
                        sub="Mean time to root cause"
                        accent
                    />
                    <StatCard
                        icon="🏭"
                        value="4.2h"
                        label="Industry Average"
                        sub="Manual investigation time"
                    />
                    <StatCard
                        icon="⏱️"
                        value={stats.timeSavedHours != null ? `${stats.timeSavedHours}h` : '—'}
                        label="Total Time Saved"
                        sub={`Across ${stats.total} investigation${stats.total !== 1 ? 's' : ''}`}
                    />
                    <StatCard
                        icon="🔥"
                        value={stats.criticalCount}
                        label="Critical / High"
                        sub="Severity incidents resolved"
                    />
                    <StatCard
                        icon="✅"
                        value={`${stats.successRate}%`}
                        label="Success Rate"
                        sub="Investigations with root cause"
                    />
                    <StatCard
                        icon="🚀"
                        value={formatDuration(stats.fastestMttr)}
                        label="Fastest Investigation"
                        sub="Best case resolution time"
                    />
                </div>
            )}

            {/* ── MTTR vs Industry banner ── */}
            {stats?.avgMttr != null && (
                <div className="hist-savings-banner">
                    <span className="hist-savings-banner__icon">📊</span>
                    <div className="hist-savings-banner__text">
                        <strong>DataSheriff MTTR: {formatDuration(stats.avgMttr)}</strong>
                        &nbsp;vs&nbsp;
                        <strong>Industry average: 4.2 hours</strong>
                        &nbsp;—&nbsp;
                        <span className="hist-savings-banner__highlight">
                            {stats.timeSavedHours}h saved across {stats.total} investigation{stats.total !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            )}

            {/* ── Table header ── */}
            <div className="hist-table-header">
                <h3 className="hist-table-title">
                    Incident History
                    <span className="hist-table-count">{history.length}</span>
                </h3>
                <button className="hist-clear-btn" onClick={onClear}>
                    🗑 Clear History
                </button>
            </div>

            {/* ── Table ── */}
            <div className="hist-table">
                <div className="hist-table__head">
                    <div>Time</div>
                    <div>Query</div>
                    <div>Root Cause Asset</div>
                    <div>Severity</div>
                    <div>MTTR</div>
                    <div>Failing Tests</div>
                    <div></div>
                </div>

                {history.map((h) => (
                    <div key={h.id}>
                        <div
                            className={`hist-table__row ${expandedId === h.id ? 'hist-table__row--expanded' : ''}`}
                            onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                        >
                            <div className="hist-cell hist-cell--time">{formatTime(h.timestamp)}</div>
                            <div className="hist-cell hist-cell--query" title={h.query}>{h.query}</div>
                            <div className="hist-cell hist-cell--asset">
                                {h.rootCauseAsset
                                    ? <span className="hist-fqn">{h.rootCauseAsset.split('.').pop()}</span>
                                    : <span className="hist-null">—</span>
                                }
                            </div>
                            <div className="hist-cell">
                                <SeverityBadge severity={h.severity} />
                            </div>
                            <div className="hist-cell hist-cell--duration">
                                <span className={`hist-duration ${h.durationSec < 30 ? 'hist-duration--fast' : ''}`}>
                                    {formatDuration(h.durationSec)}
                                </span>
                            </div>
                            <div className="hist-cell">
                                {h.failingTestCount > 0
                                    ? <span className="hist-badge-fail">{h.failingTestCount} failed</span>
                                    : <span className="hist-badge-none">—</span>
                                }
                            </div>
                            <div className="hist-cell hist-cell--actions">
                                <button
                                    className="hist-replay-btn"
                                    onClick={(e) => { e.stopPropagation(); onReplay(h.query) }}
                                    title="Re-run this investigation"
                                >
                                    ↩ Replay
                                </button>
                                <span className="hist-expand-icon">{expandedId === h.id ? '▲' : '▼'}</span>
                            </div>
                        </div>

                        {/* Expanded row detail */}
                        {expandedId === h.id && (
                            <div className="hist-detail animate-fade-up">
                                <div className="hist-detail__grid">
                                    <div className="hist-detail__block">
                                        <div className="hist-detail__label">Root Cause</div>
                                        <div className="hist-detail__value">{h.rootCause ?? '—'}</div>
                                    </div>
                                    <div className="hist-detail__block">
                                        <div className="hist-detail__label">Affected Asset</div>
                                        <div className="hist-detail__value hist-detail__value--mono">{h.affectedAsset ?? '—'}</div>
                                    </div>
                                    <div className="hist-detail__block">
                                        <div className="hist-detail__label">Root Cause Asset</div>
                                        <div className="hist-detail__value hist-detail__value--mono">{h.rootCauseAsset ?? '—'}</div>
                                    </div>
                                    <div className="hist-detail__block">
                                        <div className="hist-detail__label">Owner</div>
                                        <div className="hist-detail__value">{h.owner ?? 'No owner assigned'}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

        </div>
    )
}