/**
 * useHistory.js
 * Custom hook that persists DataSheriff investigation history to localStorage.
 * Keeps last 50 investigations. Computes MTTR and other stats automatically.
 */

import { useState, useCallback } from 'react'

const STORAGE_KEY = 'datasheriff_history'
const MAX_ENTRIES = 50

function loadHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

function saveHistory(entries) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch {
        // localStorage full or unavailable — fail silently
    }
}

export function useHistory() {
    const [history, setHistory] = useState(() => loadHistory())

    /**
     * Save a completed investigation to history.
     * @param {object} params
     * @param {string} params.query        - The user's original query
     * @param {object} params.report       - The final JSON report from the agent
     * @param {number} params.startedAt    - Date.now() when investigation started
     * @param {number} params.completedAt  - Date.now() when done event fired
     * @param {boolean} params.hasError    - Whether investigation ended in error
     */
    const saveInvestigation = useCallback(({ query, report, startedAt, completedAt, hasError }) => {
        const durationMs = completedAt - startedAt
        const durationSec = Math.round(durationMs / 1000)

        const entry = {
            id: `inv-${startedAt}`,
            timestamp: completedAt,
            query,
            durationSec,
            severity: report?.severity ?? (hasError ? 'Error' : 'Unknown'),
            rootCause: report?.root_cause ?? (hasError ? 'Investigation failed' : null),
            affectedAsset: report?.affected_asset ?? null,
            rootCauseAsset: report?.root_cause_asset ?? null,
            owner: report?.owner ?? null,
            failingTestCount: report?.failing_tests?.length ?? 0,
            complete: report?.investigation_complete ?? false,
            hasError,
        }

        setHistory(prev => {
            const updated = [entry, ...prev].slice(0, MAX_ENTRIES)
            saveHistory(updated)
            return updated
        })
    }, [])

    const clearHistory = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY)
        setHistory([])
    }, [])

    // ── Computed stats ─────────────────────────────────────────────────────────

    const stats = computeStats(history)

    return { history, saveInvestigation, clearHistory, stats }
}

function computeStats(history) {
    if (!history.length) return null

    const successful = history.filter(h => !h.hasError && h.complete)
    const durations = successful.map(h => h.durationSec)

    const avgMttr = durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null

    const fastestMttr = durations.length ? Math.min(...durations) : null
    const slowestMttr = durations.length ? Math.max(...durations) : null

    const bySeverity = history.reduce((acc, h) => {
        const s = h.severity ?? 'Unknown'
        acc[s] = (acc[s] || 0) + 1
        return acc
    }, {})

    const criticalCount = (bySeverity['Critical'] || 0) + (bySeverity['High'] || 0)

    // Industry average: 4.2 hours = 15120 seconds
    const INDUSTRY_AVG_SEC = 15120
    const timeSavedSec = avgMttr != null
        ? (INDUSTRY_AVG_SEC - avgMttr) * successful.length
        : null

    return {
        total: history.length,
        successRate: history.length ? Math.round((successful.length / history.length) * 100) : 0,
        avgMttr,
        fastestMttr,
        slowestMttr,
        criticalCount,
        bySeverity,
        timeSavedSec,
        timeSavedHours: timeSavedSec != null ? (timeSavedSec / 3600).toFixed(1) : null,
    }
}