import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE, api, isDemo } from '../api/client'
import { Logo } from '../components/Logo'
import { useLibrary } from '../store/library'

const errors: Record<string, string> = {
  invite_required: 'Soundly is invite only. Enter your invite code first.',
  invite_invalid: 'That invite code does not exist.',
  invite_used: 'That invite code has already been used.',
  invite_expired: 'That invite code has expired. Ask for a new one.',
  user_limit_reached: 'Soundly is full right now. Ask the admin to make room.',
  account_disabled: 'This account has been disabled.',
  email_unverified: 'Your Google email is not verified.',
  google_denied: 'Google sign-in was cancelled.',
  google_failed: 'Google sign-in did not work. Please try again.',
  google_mismatch: 'This email is linked to a different Google account.',
  google_not_configured: 'Google sign-in is not set up on this server yet.',
}

export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const me = useLibrary((s) => s.me)
  const status = useLibrary((s) => s.status)
  const [invite, setInvite] = useState((params.get('invite') ?? '').toUpperCase())
  const [message, setMessage] = useState(() => errors[params.get('error') ?? ''] ?? '')
  const [inviteOk, setInviteOk] = useState<boolean | null>(null)
  const [devEmail, setDevEmail] = useState('')

  // Tell people early whether their invite is usable, without making them go through Google first.
  useEffect(() => {
    const code = invite.trim()
    setInviteOk(null)
    if (code.length < 6 || isDemo()) return
    let live = true
    const t = setTimeout(() => {
      api<{ valid: boolean }>(`/auth/invite/${encodeURIComponent(code)}`)
        .then((r) => live && setInviteOk(r.valid))
        .catch(() => {})
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [invite])

  if (me && status === 'ready') return <Navigate to="/" replace />

  const google = (e: FormEvent) => {
    e.preventDefault()
    if (isDemo()) return navigate('/')
    const q = invite.trim() ? `?invite=${encodeURIComponent(invite.trim())}` : ''
    window.location.assign(`${API_BASE}/auth/google/start${q}`)
  }

  const devLogin = async () => {
    try {
      await api('/auth/dev-login', { method: 'POST', body: { email: devEmail, name: devEmail.split('@')[0], invite } })
      window.location.assign('/')
    } catch (e) {
      setMessage(errors[(e as { code?: string }).code ?? ''] ?? 'Dev login failed.')
    }
  }

  return (
    <div className="login">
      <div className="login-bg" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${-i * 0.37}s` }} />
        ))}
      </div>
      <form className="login-card" onSubmit={google}>
        <Logo size={72} />
        <h1>Soundly</h1>
        <p className="muted">Private music for friends. Invite only.</p>

        <label className="field">
          <span>Invite code</span>
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value.toUpperCase())}
            placeholder="SND-XXXXXXXX"
            autoComplete="off"
            spellCheck={false}
          />
          {inviteOk === true && <em className="hint ok">Invite looks good</em>}
          {inviteOk === false && <em className="hint bad">That invite is not valid or already used</em>}
        </label>

        {message && (
          <p className="login-error" role="alert">
            {message}
          </p>
        )}

        <button type="submit" className="google-btn">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Continue with Google
        </button>
        <small className="muted">Already have an account? Leave the code empty.</small>

        {import.meta.env.DEV && !isDemo() && (
          <div className="dev-login">
            <small className="muted">Local dev login (not in production)</small>
            <input value={devEmail} onChange={(e) => setDevEmail(e.target.value)} placeholder="email@example.com" />
            <button type="button" className="btn-pill" disabled={!devEmail.includes('@')} onClick={() => void devLogin()}>
              Dev sign in
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
