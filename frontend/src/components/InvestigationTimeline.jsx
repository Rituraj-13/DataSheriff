// import { useEffect, useRef } from 'react'
// import './InvestigationTimeline.css'

// export default function InvestigationTimeline({ steps, isRunning }) {
//   const bottomRef = useRef(null)

//   useEffect(() => {
//     bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
//   }, [steps])

//   if (!steps.length && !isRunning) return null

//   return (
//     <div className="timeline" role="log" aria-label="Investigation timeline" aria-live="polite">
//       <div className="timeline__header">
//         <span className="timeline__icon">🔎</span>
//         <h2 className="timeline__title">Live Investigation</h2>
//         {isRunning && <span className="timeline__live-badge"><span className="live-dot" /> LIVE</span>}
//       </div>

//       <div className="timeline__steps">
//         {steps.map((step, i) => (
//           <div
//             key={i}
//             className={`timeline__step animate-fade-up ${step.status || 'info'}`}
//             style={{ animationDelay: `${i * 0.04}s` }}
//           >
//             <div className="timeline__step-connector">
//               <div className="timeline__step-dot" />
//               {i < steps.length - 1 && <div className="timeline__step-line" />}
//             </div>
//             <div className="timeline__step-content">
//               <div className="timeline__step-title">{step.title}</div>
//               {step.detail && (
//                 <pre className="timeline__step-detail">{
//                   typeof step.detail === 'string' && step.detail.startsWith('{')
//                     ? step.detail
//                     : step.detail
//                 }</pre>
//               )}
//             </div>
//           </div>
//         ))}

//         {isRunning && (
//           <div className="timeline__step animate-fade-up thinking">
//             <div className="timeline__step-connector">
//               <div className="timeline__step-dot thinking-dot" />
//             </div>
//             <div className="timeline__step-content">
//               <div className="timeline__thinking-dots">
//                 <span /><span /><span />
//               </div>
//             </div>
//           </div>
//         )}

//         <div ref={bottomRef} />
//       </div>
//     </div>
//   )
// }


import { useEffect, useRef } from 'react'
import './InvestigationTimeline.css'

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ confidence, isRunning }) {
  const pct = confidence ?? 0

  // Color transitions: grey → amber → green
  const color =
    pct >= 80 ? '#1D9E75' :
    pct >= 50 ? '#EF9F27' :
    pct >= 20 ? '#534AB7' :
    '#9898B8'

  const label =
    pct === 0  ? 'Starting…'         :
    pct <= 15  ? 'Locating asset…'   :
    pct <= 30  ? 'Reading lineage…'  :
    pct <= 55  ? 'Checking quality…' :
    pct <= 75  ? 'Evidence found'    :
    pct <= 90  ? 'Confirming cause…' :
    pct < 100  ? 'Root cause found'  :
    'Complete ✓'

  return (
    <div className="confidence-bar" aria-label={`Investigation confidence: ${pct}%`}>
      <div className="confidence-bar__header">
        <span className="confidence-bar__label">{label}</span>
        <span className="confidence-bar__pct" style={{ color }}>{pct}%</span>
      </div>
      <div className="confidence-bar__track">
        <div
          className="confidence-bar__fill"
          style={{
            width: `${pct}%`,
            background: color,
            transition: 'width .5s ease, background .4s ease',
          }}
        />
        {isRunning && pct < 100 && (
          <div
            className="confidence-bar__shimmer"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InvestigationTimeline({ steps, isRunning, confidence }) {
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
        {isRunning && (
          <span className="timeline__live-badge">
            <span className="live-dot" /> LIVE
          </span>
        )}
      </div>

      {/* Confidence bar — shown whenever we have a score */}
      {(isRunning || confidence > 0) && (
        <ConfidenceBar confidence={confidence} isRunning={isRunning} />
      )}

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
                <pre className="timeline__step-detail">
                  {step.detail}
                </pre>
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