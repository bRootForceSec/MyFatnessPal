import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { SyncBadge } from '../components/SyncBadge';
import { exportAll, importBackup } from '../lib/records';
import { buildCsv, type CsvKind } from '../lib/csv';
import { updateSettings, useSettings } from '../lib/settings';
import { configFromBuild, getConfig, getSupabase, saveConfig } from '../lib/supabase';
import { syncNow, useSyncState } from '../lib/sync';
import { usdaKeyFromBuild } from '../lib/foodApi';
import { saveUsdaKey } from '../lib/usdaKeySync';
import { go } from '../lib/router';
import { localDate } from '../lib/dates';

export function Settings() {
  const { units } = useSettings();

  const stamp = () => localDate();
  function save(text: string, type: string, name: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function download() {
    const data = await exportAll();
    save(JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2), 'application/json', `myfatnesspal-${stamp()}.json`);
  }

  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const r = await importBackup(JSON.parse(await file.text()));
      setRestoreMsg(
        `Restored: ${r.added} added, ${r.updated} updated` + (r.skipped ? `, ${r.skipped} skipped (newer here already)` : '') + '.',
      );
    } catch (e) {
      setRestoreMsg(e instanceof SyntaxError ? "That file isn't a MyFatnessPal backup." : (e as Error).message);
    }
  }

  async function csv(kind: CsvKind) {
    save(await buildCsv(kind, units), 'text/csv', `myfatnesspal-${kind}-${stamp()}.csv`);
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

      <section className="card">
        <h2>Nutrition targets</h2>
        <p className="muted">Your stats, goal, protein and training-day calories.</p>
        <button className="secondary" onClick={() => go('targets')}>
          Open targets
        </button>
      </section>

      <SyncSection />

      {!usdaKeyFromBuild() && <UsdaKey />}

      <section className="card">
        <h2>Your data</h2>
        <p className="muted">Spreadsheets (CSV) open in Excel, Google Sheets or Numbers.</p>
        <div className="export-grid">
          <button className="secondary" onClick={() => csv('daily')}>
            Daily summary
          </button>
          <button className="secondary" onClick={() => csv('food')}>
            Food log
          </button>
          <button className="secondary" onClick={() => csv('workouts')}>
            Workouts (every set)
          </button>
          <button className="secondary" onClick={() => csv('body')}>
            Weight and measurements
          </button>
          <button className="secondary" onClick={() => csv('sleep')}>
            Sleep
          </button>
        </div>
        <p className="muted small">A full backup of everything, as one JSON file:</p>
        <div className="export-grid">
          <button className="secondary" onClick={download}>
            Download backup
          </button>
          <label className="secondary file-btn">
            Restore backup
            <input type="file" accept=".json,application/json" onChange={(e) => restore(e.target.files?.[0])} hidden />
          </label>
        </div>
        <p className="muted small">
          Restoring adds back anything missing from this device. Where something exists in both, the newer edit is kept.
        </p>
        {restoreMsg && <p className="small">{restoreMsg}</p>}
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

function UsdaKey() {
  const { usda_key, loaded } = useSettings();
  const [key, setKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = key ?? usda_key ?? '';
  const saved = !!usda_key && value.trim() === usda_key;
  return (
    <section className="card">
      <h2>Food search key</h2>
      <p className="muted">
        Food search uses the free USDA database. Without your own key it's limited to about 30 searches an hour. Get a free key at
        fdc.nal.usda.gov/api-key-signup.html and paste it here. It syncs to your other devices.
      </p>
      <label className="field">
        <span>USDA API key</span>
        <input value={value} onChange={(e) => setKey(e.target.value)} placeholder="DEMO_KEY" autoComplete="off" spellCheck={false} />
      </label>
      <button
        className="secondary"
        disabled={!loaded || saving || saved}
        onClick={async () => {
          setSaving(true);
          await saveUsdaKey(value);
          setKey(null);
          setSaving(false);
        }}
      >
        {saved ? 'Saved' : 'Save key'}
      </button>
      <p className="small muted">
        {usda_key ? `✓ Saved and synced to your devices (ends in …${usda_key.slice(-4)}).` : 'No key saved yet. Using the shared demo key.'}
      </p>
    </section>
  );
}
