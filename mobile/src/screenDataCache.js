const snapshots = new Map();
const maxSnapshots = 32;
const snapshotTtlMs = 90_000;
let activeSession = null;

function useSession(session) {
  const next = String(session || 'guest');
  if (activeSession !== next) {
    snapshots.clear();
    activeSession = next;
  }
}

export function readScreenSnapshot(key, session) {
  useSession(session);
  const entry = snapshots.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    snapshots.delete(key);
    return null;
  }
  snapshots.delete(key);
  snapshots.set(key, entry);
  return entry.value;
}

export function writeScreenSnapshot(key, session, value) {
  useSession(session);
  snapshots.delete(key);
  snapshots.set(key, { value, expiresAt: Date.now() + snapshotTtlMs });
  while (snapshots.size > maxSnapshots) snapshots.delete(snapshots.keys().next().value);
}

export function clearScreenSnapshots() {
  snapshots.clear();
  activeSession = null;
}
