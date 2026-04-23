/**
 * HistoryDashboard.jsx
 * Shows all past investigations, MTTR stats, severity breakdown,
 * time saved vs industry average, and a severity trend bar chart.
 *
 * Requires: npm install recharts
 */

import { useState } from 'react'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LineChart,
    Line,
    CartesianGrid,
} from 'recharts'
import './HistoryDashboard.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_COLOR = {
    Critical: { bg: 'rgba(239,68,68,0.16)', text: '#FCA5A5', dot: '#EF4444', bar: '#EF4444' },
    High: { bg: 'rgba(245,158,11,0.16)', text: '#FCD34D', dot: '#F59E0B', bar: '#F59E0B' },
    Medium: { bg: 'rgba(79,140,255,0.16)', text: '#BFDBFE', dot: '#4F8CFF', bar: '#4F8CFF' },
    Low: { bg: 'rgba(34,197,94,0.16)', text: '#86EFAC', dot: '#22C55E', bar: '#22C55E' },
    Unknown: { bg: 'rgba(148,163,184,0.16)', text: '#CBD5E1', dot: '#94A3B8', bar: '#94A3B8' },
    Error: { bg: 'rgba(148,163,184,0.16)', text: '#CBD5E1', dot: '#94A3B8', bar: '#94A3B8' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

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

// ── Custom Tooltip for charts ─────────────────────────────────────────────────

function SeverityTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const color = SEVERITY_COLOR[label]?.bar ?? '#94A3B8'
    return (
        <div style={{
            background: 'rgba(9,14,28,0.96)',
            border: '1px solid rgba(148,163,184,0.28)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: '0.75rem',
            color: '#e5efff',
        }}>
            <span style={{ color, fontWeight: 700 }}>{label}</span>
            <span style={{ marginLeft: 8 }}>{payload[0].value} investigation{payload[0].value !== 1 ? 's' : ''}</span>
        </div>
    )
}

function MttrTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    return (
        <div style={{
            background: 'rgba(9,14,28,0.96)',
            border: '1px solid rgba(148,163,184,0.28)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: '0.75rem',
            color: '#e5efff',
        }}>
            <div style={{ color: '#94A3B8', marginBottom: 2 }}>{label}</div>
            <span style={{ color: '#86efac', fontWeight: 700 }}>{payload[0].value}s MTTR</span>
        </div>
    )
}

// ── Severity Trend Charts ─────────────────────────────────────────────────────

function SeverityCharts({ history }) {
    if (!history.length) return null

    // Build severity distribution data
    const severityOrder = ['Critical', 'High', 'Medium', 'Low']
    const counts = severityOrder.reduce((acc, s) => ({ ...acc, [s]: 0 }), {})
    history.forEach(h => {
        const sev = h.severity
        if (counts[sev] !== undefined) counts[sev]++
        else if (sev && sev !== 'Unknown' && sev !== 'Error') counts[sev] = (counts[sev] || 0) + 1
    })

    const barData = severityOrder
        .filter(s => counts[s] > 0)
        .map(s => ({ name: s, count: counts[s] }))

    // Build MTTR trend — last 10 investigations with a duration, in chronological order
    const mttrData = [...history]
        .filter(h => h.durationSec != null)
        .reverse()
        .slice(0, 10)
        .map((h, i) => ({
            name: `#${i + 1}`,
            mttr: h.durationSec,
            label: formatTime(h.timestamp),
        }))

    const hasBarData = barData.length > 0
    const hasMttrData = mttrData.length >= 2

    if (!hasBarData && !hasMttrData) return null

    return (
        <div className="hist-charts-row">
            {/* ── Severity distribution ── */}
            {hasBarData && (
                <div className="hist-chart-card">
                    <div className="hist-chart-card__title">Severity Distribution</div>
                    <div className="hist-chart-card__subtitle">Investigations by severity level</div>
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={barData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} barCategoryGap="28%">
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 11, fill: '#94A3B8', fontWeight: 600 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                allowDecimals={false}
                                tick={{ fontSize: 10, fill: '#64748B' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip content={<SeverityTooltip />} cursor={{ fill: 'rgba(79,140,255,0.06)' }} />
                            <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={52}>
                                {barData.map((entry) => (
                                    <Cell
                                        key={entry.name}
                                        fill={SEVERITY_COLOR[entry.name]?.bar ?? '#94A3B8'}
                                        fillOpacity={0.85}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ── MTTR trend ── */}
            {hasMttrData && (
                <div className="hist-chart-card">
                    <div className="hist-chart-card__title">MTTR Trend</div>
                    <div className="hist-chart-card__subtitle">Investigation time (seconds) — last {mttrData.length}</div>
                    <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={mttrData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 10, fill: '#64748B' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: '#64748B' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip content={<MttrTooltip />} cursor={{ stroke: 'rgba(79,140,255,0.3)', strokeWidth: 1 }} />
                            <Line
                                type="monotone"
                                dataKey="mttr"
                                stroke="#22C55E"
                                strokeWidth={2}
                                dot={{ r: 3, fill: '#22C55E', strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: '#86efac', strokeWidth: 0 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

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

            {/* ── Severity + MTTR trend charts ── */}
            <SeverityCharts history={history} />

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
                                    {h.governanceAction && (
                                        <div className="hist-detail__block">
                                            <div className="hist-detail__label">Governance Action</div>
                                            <div className="hist-detail__value" style={{ color: '#86efac' }}>
                                                🏷️ {h.governanceAction}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

        </div>
    )
}