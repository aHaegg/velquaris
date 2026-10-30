import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { activateAccount, login, lookupAccount } from "../api";
import { useAuth } from "../auth";
import { useTitle } from "../title";
import type { AccountStatus } from "../types";

export function LoginPage() {
  useTitle("Sign in");
  const { user, ready, setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to="/" replace />;

  async function onUsername(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await lookupAccount(username);
      setStatus(result.status);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That username could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  async function onPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(await login(username, password));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setUser(await activateAccount(username, otp, password));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not set the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="site">
        <span className="mark">
          <span className="pip" aria-hidden="true" />
          Velquaris
        </span>
      </header>
      <main>
        <header className="page-head">
          <h1>Sign in</h1>
          <p>
            {status === "invite"
              ? "Enter the four-digit one-time password, then choose your own password."
              : status === "active"
                ? "Enter the password you chose."
                : "Use the username from your invite."}
          </p>
        </header>
        {error ? (
          <section className="banner bad">
            <p>{error}</p>
          </section>
        ) : null}
        {status === null ? (
          <form className="panel form" onSubmit={onUsername}>
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </label>
            <button type="submit" disabled={busy || !ready}>
              {busy ? "Checking…" : "Continue"}
            </button>
          </form>
        ) : null}
        {status === "active" ? (
          <form className="panel form" onSubmit={onPassword}>
            <p>
              {username}{" "}
              <button type="button" className="text-button" onClick={() => reset(setStatus, setError)}>
                Change
              </button>
            </p>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : null}
        {status === "invite" ? (
          <form className="panel form" onSubmit={onInvite}>
            <p>
              {username}{" "}
              <button type="button" className="text-button" onClick={() => reset(setStatus, setError)}>
                Change
              </button>
            </p>
            <label>
              One-time password
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <span className="hint">At least 8 characters.</span>
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Set password and sign in"}
            </button>
          </form>
        ) : null}
      </main>
    </>
  );
}

function reset(setStatus: (status: AccountStatus | null) => void, setError: (error: string | null) => void) {
  setStatus(null);
  setError(null);
}
