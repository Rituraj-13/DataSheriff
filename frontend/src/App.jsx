import { useState, useRef, useCallback } from 'react'
import InvestigationTimeline from './components/InvestigationTimeline'
import LineageGraph from './components/LineageGraph'
import ReportCard from './components/ReportCard'
import './App.css'

const SAMPLE_QUERIES = [
  'Revenue dashboard shows incorrect numbers since 2 AM',
  'daily_revenue table has wrong totals for last 3 days',
  'shopify pipeline failed and downstream dashboards are broken',
  'Customer lifetime value metrics dropped to zero overnight',
]

const API_BASE = 'http://localhost:8000'

export default function App() {
  const [query, setQuery] = useState('')
  const [steps, setSteps] = useState([])
  const [report, setReport] = useState(null)
  const [lineageData, setLineageData] = useState(null)
  const [failingFqns, setFailingFqns] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const handleEvent = useCallback((event) => {
    switch (event.type) {
      case 'step':
        setSteps(prev => [...prev, {
          title: event.title,
          detail: event.detail || '',
          status: 'info',
        }])
        break

      case 'tool_result': {
        try {
          const result = typeof event.result === 'string'
            ? JSON.parse(event.result)
            : event.result
          // Capture lineage data
          if (result.nodes && result.edges) {
            setLineageData(result)
          }
          // Capture failing tables from quality checks
          if (result.tests && result.failing > 0 && result.table_fqn) {
            setFailingFqns(prev => [...new Set([...prev, result.table_fqn])])
          }
        } catch {
          // not JSON — skip
        }
        break
      }

      case 'report':
        setReport(event.report)
        if (event.report?.root_cause_asset) {
          setFailingFqns(prev => [...new Set([...prev, event.report.root_cause_asset])])
        }
        break

      case 'error':
        setError(event.message)
        setSteps(prev => [...prev, {
          title: `❌ ${event.message}`,
          detail: '',
          status: 'error',
        }])
        break

      case 'done':
        setIsRunning(false)
        break

      default:
        break
    }
  }, [])

  const startInvestigation = useCallback(async (overrideQuery) => {
    const q = (overrideQuery ?? query).trim()
    if (!q || isRunning) return

    // Reset all state
    setSteps([])
    setReport(null)
    setLineageData(null)
    setFailingFqns([])
    setError(null)
    setIsRunning(true)

    // Abort any previous stream
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch(`${API_BASE}/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            handleEvent(event)
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        const msg = err.message || 'Connection failed'
        setError(msg)
        setSteps(prev => [...prev, { title: `❌ ${msg}`, detail: '', status: 'error' }])
      }
    } finally {
      setIsRunning(false)
    }
  }, [query, isRunning, handleEvent])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      startInvestigation()
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setIsRunning(false)
  }

  const handleSampleClick = (q) => {
    setQuery(q)
    startInvestigation(q)
  }

  const handleReset = () => {
    abortRef.current?.abort()
    setSteps([])
    setReport(null)
    setLineageData(null)
    setFailingFqns([])
    setError(null)
    setIsRunning(false)
    setQuery('')
  }

  const hasResults = steps.length > 0 || report !== null || lineageData !== null

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-logo">
            <span className="app-logo__icon">🔍</span>
            <div>
              <h1 className="app-logo__name">DataSheriff</h1>
              <p className="app-logo__tagline">AI Data Incident Investigator</p>
            </div>
          </div>
          <div className="app-header__right">
            <div className="app-header__badges">
              <span className="badge badge--purple">Claude Sonnet</span>
              <span className="badge badge--purple">OpenMetadata</span>
              <span className="badge badge--purple">MCP</span>
            </div>
            {hasResults && (
              <button
                id="reset-btn"
                className="btn btn--ghost"
                onClick={handleReset}
                aria-label="Start a new investigation"
              >
                ↩ New Investigation
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">

        {/* ── Hero (only when no results) ── */}
        {!hasResults && (
          <div className="app-hero animate-fade-up">
            <div className="app-hero__glow" />
            <div className="app-hero__badge badge badge--danger">
              <span className="live-dot" />&nbsp;Data Incident Detected
            </div>
            <h2 className="app-hero__title">
              Debug broken pipelines<br />
              <span className="app-hero__title-highlight">in seconds, not hours</span>
            </h2>
            <p className="app-hero__desc">
              Describe your data issue in plain English. DataSheriff will search assets,
              traverse lineage, check quality tests, and identify the root cause automatically.
            </p>
            <div className="app-hero__stats">
              <div className="hero-stat">
                <span className="hero-stat__value">3–6h</span>
                <span className="hero-stat__label">Manual debugging</span>
              </div>
              <div className="hero-stat__arrow">→</div>
              <div className="hero-stat hero-stat--accent">
                <span className="hero-stat__value">&lt;30s</span>
                <span className="hero-stat__label">With DataSheriff</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Query Panel ── */}
        <div className={`query-panel ${hasResults ? 'query-panel--compact' : ''}`}>
          <div className="query-panel__inner">
            <span className="query-input-icon" aria-hidden="true">🚨</span>
            <textarea
              id="incident-query"
              className="query-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Describe the data issue… e.g. "Revenue dashboard shows incorrect numbers since 2 AM"'
              rows={hasResults ? 1 : 2}
              disabled={isRunning}
              aria-label="Describe the data incident"
            />
            <div className="query-panel__actions">
              <span className="query-hint">⌘↵ to submit</span>
              {isRunning ? (
                <button
                  id="stop-investigation-btn"
                  className="btn btn--secondary"
                  onClick={handleStop}
                  aria-label="Stop investigation"
                >
                  <span className="spinner" aria-hidden="true" /> Stop
                </button>
              ) : (
                <button
                  id="start-investigation-btn"
                  className="btn btn--primary"
                  onClick={() => startInvestigation()}
                  disabled={!query.trim()}
                  aria-label="Start investigation"
                >
                  🔍 Investigate
                </button>
              )}
            </div>
          </div>

          {/* Sample chips — only on hero */}
          {!hasResults && (
            <div className="sample-queries">
              <span className="sample-queries__label">Try an example:</span>
              <div className="sample-queries__list">
                {SAMPLE_QUERIES.map((q, i) => (
                  <button
                    key={i}
                    className="sample-query-chip"
                    onClick={() => handleSampleClick(q)}
                    aria-label={`Use sample: ${q}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Results ── */}
        {hasResults && (
          <div className="results-grid">
            {/* Left col: Timeline + Report */}
            <div className="results-col results-col--left">
              <InvestigationTimeline steps={steps} isRunning={isRunning} />
              {report && <ReportCard report={report} />}
            </div>

            {/* Right col: Lineage Graph */}
            {lineageData && lineageData.nodes?.length > 0 && (
              <div className="results-col results-col--right">
                <LineageGraph lineageData={lineageData} failingFqns={failingFqns} />
              </div>
            )}
          </div>
        )}

        {/* ── Error banner ── */}
        {error && !isRunning && (
          <div className="error-toast animate-fade-up" role="alert" aria-live="assertive">
            ⚠️ {error}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="app-footer">
        <span>
          Built for&nbsp;
          <a href="https://www.wemakedevs.org/hackathons/openmetadata" target="_blank" rel="noopener noreferrer">
            WeMakeDevs × OpenMetadata Hackathon
          </a>
        </span>
        <span className="footer-sep">·</span>
        <span>Powered by Claude + OpenMetadata MCP</span>
      </footer>
    </div>
  )
}
