import { useState } from "react";
import { API_BASE } from "../lib/api";

interface Props {
  onLogin: (username: string, password: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setBusy(true);
    setErr(null);
    try {
      await onLogin(username.trim(), password);
    } catch (error) {
      setErr(
        error instanceof Error ? error.message : "Login failed. Check credentials."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="card">
        <h1>Waiter sign-in</h1>
        <p className="sub">
          Use your restaurant staff credentials. Orders go straight to the
          kitchen and appear in management.
        </p>
        <form onSubmit={submit}>
          <label style={{ display: "grid", gap: 4 }}>
            <small className="hint">Username or email</small>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <small className="hint">Password</small>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {err && <div className="status err">{err}</div>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <small className="hint">API: {API_BASE || "(not configured)"}</small>
        </form>
      </div>
    </div>
  );
}
