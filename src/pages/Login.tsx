import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'

export function Login() {
  const navigate = useNavigate()
  const [invite, setInvite] = useState('')

  return (
    <div className="login">
      <div className="login-bg" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${-i * 0.37}s` }} />
        ))}
      </div>
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault()
          navigate('/')
        }}
      >
        <Logo size={72} />
        <h1>Soundly</h1>
        <p className="muted">Private music for friends. Invite only.</p>

        <label className="field">
          <span>Invite code</span>
          <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="e.g. SND-4821" autoComplete="off" />
        </label>

        <button type="submit" className="google-btn">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z" />
            <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.500-5.800c-2.100 1.400-4.800 2.300-8.400 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
          </svg>
          Continue with Google
        </button>
        <small className="muted">Demo screen. Sign-in is wired up in the backend phase.</small>
      </form>
    </div>
  )
}
