import { useSyncState } from '../lib/sync';

export function SyncBadge() {
  const s = useSyncState();
  const label =
    s.kind === 'off'
      ? 'This device only'
      : s.kind === 'syncing'
        ? 'Syncing…'
        : s.kind === 'offline'
          ? 'Offline, saved on phone'
          : s.kind === 'error'
            ? 'Sync problem'
            : 'Synced';
  return (
    <span className={`sync-badge sync-${s.kind}`} title={s.kind === 'error' ? s.message : undefined}>
      <span className="dot" />
      {label}
    </span>
  );
}
