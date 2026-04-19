import { useEffect, useRef } from 'react'
import './InvestigationTimeline.css'

export default function InvestigationTimeline({ steps, isRunning }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps])

  if (!steps.length && !isRunning) return null

  return (
    <div className="timeline" role="log" aria-label="Investigation timeline" aria-live="polite">
      <div className="timeline__header">
        <span className="timeline__icon">🔎</span>
        <h2 className="timeline__title">Live Investigation</h2>
        {isRunning && <span className="timeline__live-badge"><span className="live-dot" /> LIVE</span>}
      </div>

      <div className="timeline__steps">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`timeline__step animate-fade-up ${step.status || 'info'}`}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <div className="timeline__step-connector">
              <div className="timeline__step-dot" />
              {i < steps.length - 1 && <div className="timeline__step-line" />}
            </div>
            <div className="timeline__step-content">
              <div className="timeline__step-title">{step.title}</div>
              {step.detail && (
                <pre className="timeline__step-detail">{
                  typeof step.detail === 'string' && step.detail.startsWith('{')
                    ? step.detail
                    : step.detail
                }</pre>
              )}
            </div>
          </div>
        ))}

        {isRunning && (
          <div className="timeline__step animate-fade-up thinking">
            <div className="timeline__step-connector">
              <div className="timeline__step-dot thinking-dot" />
            </div>
            <div className="timeline__step-content">
              <div className="timeline__thinking-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
