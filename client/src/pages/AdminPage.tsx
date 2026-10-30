import { useEffect, useState, type FormEvent } from "react";
import { inviteMember, listMembers } from "../api";
import { useTitle } from "../title";
import type { Member } from "../types";

export function AdminPage() {
  useTitle("People");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMembers()
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "People could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await inviteMember(username, otp);
      setNotice(
        result.replaced
          ? `Replaced the one-time password for ${result.username}. Give them ${result.otp}.`
          : `Give ${result.username} the one-time password ${result.otp}. They choose their own password the first time they sign in.`,
      );
      setUsername("");
      setOtp("");
      setMembers(await listMembers());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The invite could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>People</h1>
        <p>Invite someone with a username and a four-digit one-time password. Tell them both yourself.</p>
      </header>
      {notice ? (
        <section className="banner ok">
          <p>{notice}</p>
        </section>
      ) : null}
      {error ? (
        <section className="banner bad">
          <p>{error}</p>
        </section>
      ) : null}
      <form className="panel form" onSubmit={onSubmit}>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" required />
        </label>
        <label>
          One-time password
          <input
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            required
          />
          <span className="hint">Four digits. It works once, then they set their own password.</span>
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Invite"}
        </button>
      </form>
      {members ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.username}>
                  <td>{member.username}</td>
                  <td>{member.role === "admin" ? "Admin" : "Member"}</td>
                  <td>{member.status === "active" ? "Password chosen" : "Waiting for first sign-in"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
