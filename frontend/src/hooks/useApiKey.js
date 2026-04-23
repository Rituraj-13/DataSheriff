/**
 * useApiKey.js
 * Manages the user's Anthropic API key in localStorage.
 * The key never leaves the browser except as a header to the backend.
 */

import { useState, useCallback } from 'react'

const STORAGE_KEY = 'datasheriff_anthropic_key'

export function useApiKey() {
    const [apiKey, setApiKeyState] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) || ''
        } catch {
            return ''
        }
    })

    const saveApiKey = useCallback((key) => {
        try {
            const trimmed = key.trim()
            if (trimmed) {
                localStorage.setItem(STORAGE_KEY, trimmed)
            } else {
                localStorage.removeItem(STORAGE_KEY)
            }
            setApiKeyState(trimmed)
        } catch {
            setApiKeyState(key.trim())
        }
    }, [])

    const clearApiKey = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY)
        } catch { /* ignore */ }
        setApiKeyState('')
    }, [])

    // true if key looks like a real Anthropic key
    const isValid = apiKey.startsWith('sk-ant-') && apiKey.length > 20

    return { apiKey, saveApiKey, clearApiKey, isValid }
}