import { PLAYER_PATH } from '../core/mount';
import { createLocalStorage, LOCALE_KEY } from '../../preview/player/storage';
import { EMPTY_PROFILE, normalizeProfile } from '../core/recommendation';
import type { Station } from '../core/types';
import { createHomeProvider } from '../original/home';
import { translate, resolveLocale } from '../original/i18n';
import type RadioHomeOwner from './home-owner';
import { RADIO_CHANNEL, type PlayerCommand, type PlayerSnapshot } from './player-wire';

function station(value: unknown): value is Station {
  const row = value as Station | null;
  return !!row && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.streamUrl === 'string' &&
    /^https:\/\//.test(row.streamUrl) && Array.isArray(row.tags) && row.tags.every(tag => typeof tag === 'string') &&
    typeof row.country === 'string' && typeof row.favicon === 'string';
}
function cleanSnapshot(value: unknown): PlayerSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as PlayerSnapshot;
  if (typeof raw.playing !== 'boolean' || typeof raw.loading !== 'boolean' || !raw.profile || !Array.isArray(raw.profile.history) || raw.profile.history.length > 1000) return null;
  const profile = normalizeProfile(raw.profile);
  profile.history = profile.history.filter(entry => station(entry?.station) && typeof entry.listenedAt === 'string');
  return { profile, current: station(raw.current) ? raw.current : null, playing: raw.playing, loading: raw.loading, locale: typeof raw.locale === 'string' ? raw.locale : 'zh-CN' };
}

/** One iframe belongs to plugin activation, not to the selected panel. Never reparent a loaded iframe. */
export function createRadioFrame(openPanel: () => void) {
  const storage = createLocalStorage();
  let locale = 'zh-CN';
  try { locale = localStorage.getItem(LOCALE_KEY) || locale; } catch {}
  let snapshot = cleanSnapshot({ current: null, playing: false, loading: false, profile: storage.loadProfile(), locale }) || { current: null, playing: false, loading: false, profile: normalizeProfile(EMPTY_PROFILE), locale };
  let frame: HTMLIFrameElement | null = null, anchor: HTMLElement | null = null, ready = false, closed = false;
  const listeners = new Set<() => void>(), pending: PlayerCommand[] = [];
  const position = () => {
    if (!frame || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    Object.assign(frame.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, visibility: 'visible', pointerEvents: 'auto' });
    frame.removeAttribute('aria-hidden'); frame.tabIndex = 0;
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(position) : null;
  function ensureFrame() {
    if (closed) throw Error('Radio has closed');
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.src = PLAYER_PATH; frame.title = translate('乔木电台', resolveLocale(snapshot.locale.split(/[-_]/)[0]));
    frame.allow = 'autoplay'; frame.dataset.radioFrame = '1'; frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1000px', height: '700px', border: '0', zIndex: '10', visibility: 'hidden', pointerEvents: 'none', background: '#d9d8cf' });
    frame.addEventListener('load', () => {
      ready = false;
      frame?.contentWindow?.postMessage({ channel: RADIO_CHANNEL, type: 'command', value: { kind: 'snapshot' } }, window.location.origin);
    });
    document.body.append(frame); position();
    return frame;
  }
  function command(value: PlayerCommand) {
    const target = ensureFrame();
    if (!ready) {
      // A cold iframe may need a new user gesture to satisfy the browser's autoplay policy.
      if (pending.length < 20) pending.push(value);
      openPanel();
    } else target.contentWindow?.postMessage({ channel: RADIO_CHANNEL, type: 'command', value }, window.location.origin);
  }
  const receive = (event: MessageEvent) => {
    if (closed || !frame || event.origin !== window.location.origin || event.source !== frame.contentWindow || event.data?.channel !== RADIO_CHANNEL || event.data?.type !== 'snapshot') return;
    const next = cleanSnapshot(event.data.value);
    if (!next) return;
    snapshot = next; ready = true;
    for (const value of pending.splice(0)) frame.contentWindow?.postMessage({ channel: RADIO_CHANNEL, type: 'command', value }, window.location.origin);
    for (const listener of listeners) listener();
  };
  window.addEventListener('message', receive);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  const owner: RadioHomeOwner = {
    get data() { return { profile: snapshot.profile }; },
    t: source => translate(source, resolveLocale(snapshot.locale.split(/[-_]/)[0])),
    player: {
      snapshot: () => ({ station: snapshot.current, status: snapshot.loading ? 'loading' : snapshot.playing ? 'playing' : 'paused' }),
      toggle: () => command({ kind: 'toggle' }),
    },
    activateView: openPanel,
    playStation: row => command({ kind: 'play', stationId: row.id }),
  };
  const provider = { ...createHomeProvider(owner), subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
  return {
    provider, command,
    getSnapshot: () => snapshot,
    attach(element: HTMLElement) {
      if (closed) return;
      if (anchor) observer?.unobserve(anchor);
      anchor = element; ensureFrame(); observer?.observe(element); position();
    },
    detach(element: HTMLElement) {
      if (anchor !== element) return;
      observer?.unobserve(element); anchor = null;
      if (frame) { frame.style.visibility = 'hidden'; frame.style.pointerEvents = 'none'; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true'); }
    },
    dispose() {
      if (closed) return;
      closed = true; observer?.disconnect(); pending.length = 0; listeners.clear();
      window.removeEventListener('message', receive); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      frame?.remove(); frame = null; anchor = null;
    },
  };
}
export type RadioFrame = ReturnType<typeof createRadioFrame>;
