import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The conversation loop, outside React render: say the assistant's line,
 * listen, send the answer, repeat. `deps.current` holds the latest screen
 * callbacks (speech, state setters, navigation). Every send bumps `turn`,
 * so a listen or response that arrives after a newer action is ignored.
 */
const MAX_TRANSCRIPT = 500;
const RETRY_DELAYS_MS = [800, 1600];

// Worth retrying: no connection, server hiccup, rate limit, or still busy.
function retryable(err) {
  const status = err?.response?.status;
  if (!status) return true;
  if (status === 409) return err.response.data?.code === 'busy';
  return status === 429 || status >= 500;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createConversation(deps) {
  let sessionId = null;
  let turn = 0;
  let alive = true;
  let last = null;
  const d = () => deps.current;

  async function handle(next, { quiet = false } = {}) {
    last = next;
    d().onResponse(next);
    const mine = turn;
    if (!quiet || next.done || next.handoff) {
      d().setPhase('speaking');
      await d().speak(next.speak);
    }
    if (!alive || mine !== turn) return;
    if (next.handoff) return d().toForm(next.filled);
    if (next.done) return d().setPhase('summary');
    return listenNow(next);
  }

  async function listenNow(current) {
    const mine = turn;
    d().setPhase('listening');
    d().setHeard('');
    let text;
    try {
      text = await d().listen({ contextualStrings: d().contextFor(current.ui) });
    } catch (err) {
      if (!alive || mine !== turn) return;
      if (err?.code === 'denied' || err?.code === 'unavailable') {
        await d().speak(d().t(err.code === 'denied' ? 'voice.micDenied' : 'voice.unavailable'));
        if (alive) d().toForm(current.filled);
      } else {
        d().setPhase('idle');
      }
      return;
    }
    if (!alive || mine !== turn) return;
    d().setHeard(text);
    await send({ transcript: text.slice(0, MAX_TRANSCRIPT) });
  }

  async function send(payload, { quiet = false } = {}) {
    d().stop();
    const mine = ++turn;
    d().setPhase('thinking');
    for (let attempt = 0; ; attempt += 1) {
      try {
        const next = await d().sendTurn(sessionId, payload);
        if (alive && mine === turn) await handle(next, { quiet });
        return;
      } catch (err) {
        if (!alive || mine !== turn) return;
        if (attempt < RETRY_DELAYS_MS.length && retryable(err)) {
          await wait(RETRY_DELAYS_MS[attempt]);
          if (!alive || mine !== turn) return;
          continue;
        }
        d().onServerError(err, last?.filled ?? null);
        return;
      }
    }
  }

  return {
    start() {
      d()
        .start()
        .then(
          (first) => {
            sessionId = first.sessionId;
            if (alive) handle(first);
          },
          (err) => alive && d().onServerError(err, null)
        );
    },
    tap(selection) {
      send({ selection });
    },
    /** Chip toggles: keep the server's list in step without speaking. */
    sync(selection) {
      send({ selection }, { quiet: true });
    },
    mic() {
      if (!last || last.done) return;
      d().stop();
      turn += 1;
      listenNow(last);
    },
    dispose() {
      alive = false;
      d().stop();
    },
  };
}

/**
 * Shared driver behind the voice screens (worker onboarding, job posting):
 * one conversation per mount, talking to whichever AI session `start` /
 * `sendTurn` point at. Owns the response/phase/heard state; the screen owns
 * everything derived from a particular response shape (chip selections,
 * summaries, etc.) via `onResponse`.
 */
export default function useAgentConversation({
  start,
  sendTurn,
  speak,
  listen,
  stop,
  t,
  contextFor,
  onResponse,
  onServerError,
  toForm,
}) {
  const [res, setRes] = useState(null); // last response from the assistant
  const [phase, setPhase] = useState('loading'); // loading|speaking|listening|thinking|idle|summary
  const [heard, setHeard] = useState('');

  const deps = useRef({});
  useEffect(() => {
    deps.current = {
      start,
      sendTurn,
      speak,
      listen,
      stop,
      t,
      contextFor,
      toForm,
      setPhase,
      setHeard,
      onResponse: (next) => {
        setRes(next);
        onResponse?.(next);
      },
      onServerError,
    };
  }, [start, sendTurn, speak, listen, stop, t, contextFor, toForm, onResponse, onServerError]);

  // One conversation per visit to this screen.
  const convo = useRef(null);
  useEffect(() => {
    const conversation = createConversation(deps);
    convo.current = conversation;
    conversation.start();
    return () => conversation.dispose();
  }, []);

  const tap = useCallback((selection) => convo.current?.tap(selection), []);
  const sync = useCallback((selection) => convo.current?.sync(selection), []);
  const mic = useCallback(() => convo.current?.mic(), []);

  return { res, phase, setPhase, heard, tap, sync, mic };
}
