/**
 * SettingsPage.jsx
 * Lets the user enter and save their Anthropic API key.
 * The key is stored only in their browser's localStorage.
 * It is never sent to the server except as a request header during investigations.
 */

import { useState } from 'react'
import './SettingsPage.css'

export default function SettingsPage({ apiKey, onSave, onClear, isValid }) {
    const [draft, setDraft] = useState(apiKey)
    const [visible, setVisible] = useState(false)
    const [saved, setSaved] = useState(false)

    const handleSave = () => {
        onSave(draft)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const handleClear = () => {
        setDraft('')
        onClear()
    }

    const masked = draft
        ? draft.slice(0, 10) + '•'.repeat(Math.min(draft.length - 14, 20)) + draft.slice(-4)
        : ''

    const status = !draft
        ? null
        : draft.startsWith('sk-ant-') && draft.length > 20
            ? 'valid'
            : 'invalid'

    return (
        <div className="settings-page animate-fade-up">

            {/* ── Header ── */}
            <div className="settings-header">
                <h2 className="settings-header__title">⚙️ Settings</h2>
                <p className="settings-header__sub">
                    DataSheriff uses your own Anthropic API key. It is stored only in your
                    browser's local storage and sent directly to the AI — never logged on the server.
                </p>
            </div>

            {/* ── API Key card ── */}
            <div className="settings-card">
                <div className="settings-card__header">
                    <span className="settings-card__icon">🔑</span>
                    <div>
                        <div className="settings-card__title">Anthropic API Key</div>
                        <div className="settings-card__sub">
                            Required to run investigations. Get yours at{' '}
                            <a
                                href="https://console.anthropic.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                console.anthropic.com
                            </a>
                        </div>
                    </div>
                    {isValid && (
                        <span className="settings-badge settings-badge--ok">✓ Active</span>
                    )}
                </div>

                <div className="settings-input-row">
                    <div className={`settings-input-wrap ${status ? 'settings-input-wrap--' + status : ''}`}>
                        <input
                            type={visible ? 'text' : 'password'}
                            className="settings-input"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="sk-ant-api03-..."
                            spellCheck={false}
                            autoComplete="off"
                        />
                        <button
                            className="settings-toggle-btn"
                            onClick={() => setVisible(v => !v)}
                            title={visible ? 'Hide key' : 'Show key'}
                            type="button"
                        >
                            {visible ? '🙈' : '👁️'}
                        </button>
                    </div>

                    <button
                        className="settings-save-btn"
                        onClick={handleSave}
                        disabled={!draft.trim()}
                        type="button"
                    >
                        {saved ? '✓ Saved' : 'Save Key'}
                    </button>
                </div>

                {/* Validation hint */}
                {status === 'invalid' && (
                    <p className="settings-hint settings-hint--warn">
                        ⚠ This doesn't look like a valid Anthropic key. It should start with <code>sk-ant-</code>
                    </p>
                )}
                {status === 'valid' && (
                    <p className="settings-hint settings-hint--ok">
                        ✓ Key format looks correct
                    </p>
                )}

                {/* Currently stored key info */}
                {isValid && (
                    <div className="settings-stored-row">
                        <span className="settings-stored-label">Currently stored:</span>
                        <code className="settings-stored-value">{masked}</code>
                        <button className="settings-clear-btn" onClick={handleClear} type="button">
                            Remove
                        </button>
                    </div>
                )}
            </div>

            {/* ── Privacy note ── */}
            <div className="settings-privacy">
                <span className="settings-privacy__icon">🔒</span>
                <div className="settings-privacy__text">
                    <strong>Your key stays in your browser.</strong>{' '}
                    It is stored in <code>localStorage</code> on your device and sent only
                    as an HTTP header when you run an investigation. The DataSheriff server
                    never stores, logs, or forwards your key.
                </div>
            </div>

            {/* ── Get a key CTA if not set ── */}
            {!isValid && (
                <div className="settings-cta">
                    <div className="settings-cta__text">
                        <strong>Don't have an API key?</strong>
                        <span> You need a free Anthropic account. Add ~$5 credits — that covers hundreds of investigations.</span>
                    </div>
                    <a
                        href="https://console.anthropic.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="settings-cta__btn"
                    >
                        Get API Key →
                    </a>
                </div>
            )}

        </div>
    )
}