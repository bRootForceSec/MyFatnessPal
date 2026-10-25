import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { SyncBadge } from '../components/SyncBadge';
import { exportAll } from '../lib/records';
import { updateSettings, useSettings } from '../lib/settings';
import { configFromBuild, getConfig, getSupabase, saveConfig } from '../lib/supabase';
import { syncNow, useSyncState } from '../lib/sync';

export function Settings() {
  const { units } = useSettings();

  async function download() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `myfatnesspal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="screen">
      <Header title="Settings" />

      <section className="card">
        <h2>Units</h2>
        <div className="segmented">
          <button className={units === 'metric' ? 'on' : ''} onClick={() => updateSettings({ units: 'metric' })}>
            kg · cm
          </button>
          <button className={units === 'imperial' ? 'on' : ''} onClick={() => updateSettings({ units: 'imperial' })}>
            lb · in
          </button>
        </div>
      </section>

      <SyncSection />

      <section className="card">
        <h2>Your data</h2>
        <p className="muted">Download everything you've logged as a JSON file, as a backup.</p>
        <button className="secondary" onClick={download}>
          Export my data
        </button>
      </section>
    </main>
  );
}

function SyncSection() {
  const config = getConfig();
  const sb = getSupabase();
  const sync = useSyncState();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sb) return setLoading(false);
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  if (!config) return <ConnectForm />;
  if (loading) return null;

  if (!session) return <SignIn />;

  return (
    <section className="card">
      <h2>Sync</h2>
      <p>
        Signed in as <strong>{session.user.email}</strong>
      </p>
      <p>
        <SyncBadge />
        {sync.kind === 'error' && <span className="error"> {sync.message}</span>}
      </p>
      <div className="row-btns">
        <button className="secondary" onClick={() => void syncNow()}>
          Sync now
        </button>
        <button className="secondary" onClick={() => void sb!.auth.signOut()}>
          Sign out
        </button>
      </div>
      {!configFromBuild() && (
        <button
          className="link-btn"
          onClick={() => {
            saveConfig(null);
            location.reload();
          }}
        >
          Disconnect Supabase project
        </button>
      )}
    </section>
  );
}

function ConnectForm() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  return (
    <section className="card">
      <h2>Sync between devices</h2>
      <p className="muted">
        Right now everything is saved on this device only. Paste your Supabase project URL and publishable (anon) key to
        sync with your other devices.
      </p>
      <label className="field">
        <span>Project URL</span>
        <input placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label className="field">
        <span>Publishable key</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <button
        className="secondary"
        disabled={!url.startsWith('https://') || key.length < 20}
        onClick={() => {
          saveConfig({ url, anonKey: key });
          location.reload();
        }}
      >
        Connect
      </button>
    </section>
  );
}

function SignIn() {
  const sb = getSupabase()!;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(kind: 'in' | 'up') {
    setBusy(true);
    setMsg(null);
    const res =
      kind === 'in'
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: location.origin + location.pathname },
          });
    setBusy(false);
    if (res.error) return setMsg(res.error.message);
    if (kind === 'up' && !res.data.session) setMsg('Check your email to confirm your account, then sign in here.');
  }

  return (
    <section className="card">
      <h2>Sign in to sync</h2>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {msg && <p className="muted">{msg}</p>}
      <div className="row-btns">
        <button className="secondary" disabled={busy || !email || password.length < 6} onClick={() => run('in')}>
          Sign in
        </button>
        <button className="secondary" disabled={busy || !email || password.length < 6} onClick={() => run('up')}>
          Create account
        </button>
      </div>
    </section>
  );
}
