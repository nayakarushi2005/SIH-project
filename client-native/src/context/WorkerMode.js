import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  acceptJob,
  getOffers,
  getWorkerProfile,
  goOffline as apiGoOffline,
  goOnline as apiGoOnline,
  isUnauthorized,
  rejectJob,
  saveWorkerProfile,
  sendWorkerLocation,
} from '../services/api';
import { getCurrentCoords } from '../services/location';
import { getToken } from '../services/session';

// While online and the app is open. Offers last 20 minutes, so polling is
// plenty until push notifications land; the heartbeat keeps the worker
// visible to matching (the server drops workers silent for 3 minutes).
const OFFER_POLL_MS = 5 * 1000;
const HEARTBEAT_MS = 60 * 1000;

const WorkerModeContext = createContext(null);

/**
 * Loads the signed-in user's worker profile.
 * Resolves { profile } (profile null = not a worker / signed out), or null
 * when the request failed for a reason worth ignoring (network blip).
 */
async function fetchWorkerState() {
  if (!(await getToken())) return { profile: null };
  try {
    return { profile: await getWorkerProfile() };
  } catch (err) {
    return isUnauthorized(err) ? { profile: null } : null;
  }
}

/**
 * App-wide worker state, so offers pop up on any screen:
 *   profile — undefined while loading, null if not a worker, else the profile
 *   online  — whether this worker is taking jobs
 *   offers  — open offers, oldest-expiring first
 */
export function WorkerModeProvider({ children }) {
  const [profile, setProfile] = useState(undefined);
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState([]);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  // Offers answered on this device, hidden until the server stops sending them.
  const answered = useRef(new Set());
  const onlineRef = useRef(false);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const reset = useCallback(() => {
    setProfile(null);
    setOnline(false);
    setOffers([]);
  }, []);

  const applyState = useCallback(
    (state) => {
      if (!state) return; // network blip — keep what we had
      if (!state.profile) {
        reset();
        return;
      }
      setProfile(state.profile);
      setOnline(!!state.profile.isOnline);
    },
    [reset]
  );

  const refresh = useCallback(async () => {
    const state = await fetchWorkerState();
    applyState(state);
    return state?.profile ?? null;
  }, [applyState]);

  const heartbeat = useCallback(async () => {
    try {
      const stillOnline = await sendWorkerLocation(await getCurrentCoords());
      if (!stillOnline) setOnline(false);
    } catch (err) {
      if (isUnauthorized(err)) reset();
      // Location or network hiccup — the next beat tries again.
    }
  }, [reset]);

  const pollOffers = useCallback(async () => {
    try {
      const list = await getOffers();
      const now = Date.now();
      setOffers(
        list
          .filter((o) => !answered.current.has(o.jobId) && new Date(o.expiresAt).getTime() > now)
          .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
      );
    } catch (err) {
      if (isUnauthorized(err)) reset();
    }
  }, [reset]);

  // Load once, and catch up whenever the app returns to the foreground: beat
  // first, so a worker who was away a few minutes is visible again.
  useEffect(() => {
    fetchWorkerState().then(applyState);
    const sub = AppState.addEventListener('change', async (state) => {
      setAppActive(state === 'active');
      if (state === 'active') {
        if (onlineRef.current) await heartbeat();
        refresh();
      }
    });
    return () => sub.remove();
  }, [applyState, heartbeat, refresh]);

  useEffect(() => {
    if (!online || !appActive) return undefined;
    pollOffers();
    const poll = setInterval(pollOffers, OFFER_POLL_MS);
    const beat = setInterval(heartbeat, HEARTBEAT_MS);
    return () => {
      clearInterval(poll);
      clearInterval(beat);
    };
  }, [online, appActive, pollOffers, heartbeat]);

  const goOnline = useCallback(async () => {
    const next = await apiGoOnline(await getCurrentCoords());
    setProfile(next);
    setOnline(true);
  }, []);

  const goOffline = useCallback(async () => {
    const next = await apiGoOffline();
    setProfile(next);
    setOnline(false);
    setOffers([]);
  }, []);

  const saveProfile = useCallback(async (fields) => {
    const next = await saveWorkerProfile(fields);
    setProfile(next);
    return next;
  }, []);

  const dropOffer = useCallback((jobId) => {
    answered.current.add(jobId);
    setOffers((list) => list.filter((o) => o.jobId !== jobId));
  }, []);

  /** Accepts an offer. Throws (e.g. 409 — someone else got it) for the UI to show. */
  const accept = useCallback(
    async (jobId) => {
      dropOffer(jobId);
      const job = await acceptJob(jobId);
      await refresh(); // picks up currentJob
      return job;
    },
    [dropOffer, refresh]
  );

  const reject = useCallback(
    async (jobId) => {
      dropOffer(jobId);
      await rejectJob(jobId).catch(() => {}); // already gone is fine
    },
    [dropOffer]
  );

  const value = useMemo(
    () => ({ profile, online, offers, refresh, goOnline, goOffline, saveProfile, accept, reject, dropOffer }),
    [profile, online, offers, refresh, goOnline, goOffline, saveProfile, accept, reject, dropOffer]
  );

  return <WorkerModeContext.Provider value={value}>{children}</WorkerModeContext.Provider>;
}

export function useWorkerMode() {
  const ctx = useContext(WorkerModeContext);
  if (!ctx) throw new Error('useWorkerMode must be used inside WorkerModeProvider');
  return ctx;
}
