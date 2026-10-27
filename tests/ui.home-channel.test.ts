// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRadioFrame } from '../src/client/radio-frame';
import { RADIO_CHANNEL } from '../src/client/player-wire';
import { executePlayerCommand } from '../src/client/player-channel';
import { EMPTY_PROFILE } from '../src/core/recommendation';
import type { Station } from '../src/core/types';
import type { RadioController } from '../src/client/useRadio';
import { createLocalStorage } from '../preview/player/storage';
const station: Station = { id: 'fixture', name: 'Fixture Radio', streamUrl: 'https://radio.test/live', homepage: '', favicon: '', tags: ['jazz'], country: 'Test', countryCode: 'US', language: 'en', codec: 'MP3', bitrate: 128, votes: 1, clickCount: 1 };
const profile = { ...EMPTY_PROFILE, history: [{ station, listenedAt: new Date().toISOString() }] };
let runtime: ReturnType<typeof createRadioFrame> | undefined;
beforeEach(() => {
  (window as any).happyDOM.settings.disableIframePageLoading = true;
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const element = createElement(tag, options);
    if (tag === 'iframe') element.setAttribute('srcdoc', '<!doctype html><html><body>Fixture player only</body></html>');
    return element;
  }) as typeof document.createElement);
  localStorage.clear(); document.body.replaceChildren();
  localStorage.setItem('qiaomu-radio-profile-v1', JSON.stringify(profile));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { runtime?.dispose(); runtime = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('original Home source and persistent player', () => {
  it('keeps one frame through panel detach and validates the exact sender before updating Home', async () => {
    const open = vi.fn(); runtime = createRadioFrame(open);
    const provider = runtime.provider;
    const initial = await provider.sections();
    expect(initial[0].title).toBe('继续听');
    expect(initial[0].items[0].id).toBe(station.id);
    expect(document.querySelector('iframe')).toBeNull();
    const first = document.createElement('div'); document.body.append(first); runtime.attach(first);
    const frame = document.querySelector('iframe')!;
    const sent = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    await new Promise(resolve => setTimeout(resolve, 30));
    const notify = vi.fn(), off = provider.subscribe(notify);
    const state = { channel: RADIO_CHANNEL, type: 'snapshot', value: { current: station, playing: true, loading: false, profile, locale: 'zh-CN' } };
    window.dispatchEvent(new MessageEvent('message', { data: state, origin: 'https://untrusted.test', source: frame.contentWindow }));
    window.dispatchEvent(new MessageEvent('message', { data: state, origin: window.location.origin, source: window }));
    expect(runtime.getSnapshot().playing).toBe(false);
    window.dispatchEvent(new MessageEvent('message', { data: state, origin: window.location.origin, source: frame.contentWindow }));
    expect(runtime.getSnapshot().playing).toBe(true); expect(notify).toHaveBeenCalledTimes(1);
    const current = (await provider.sections())[0].items[0];
    expect(current.actions?.[0].label).toBe('暂停');
    current.actions?.[0].run();
    expect(sent).toHaveBeenLastCalledWith({ channel: RADIO_CHANNEL, type: 'command', value: { kind: 'toggle' } }, window.location.origin);
    runtime.detach(first); first.remove();
    expect(frame.isConnected).toBe(true); expect(frame.style.visibility).toBe('hidden');
    const second = document.createElement('div'); document.body.append(second); runtime.attach(second);
    expect(document.querySelector('iframe')).toBe(frame); expect(frame.style.visibility).toBe('visible');
    off(); runtime.dispose(); expect(frame.isConnected).toBe(false);
  });
  it('queues cold Home actions until the own player announces readiness; only known IDs execute', async () => {
    const open = vi.fn(); runtime = createRadioFrame(open);
    (await runtime.provider.sections())[0].items[0].open();
    const frame = document.querySelector('iframe')!, sent = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    expect(open).toHaveBeenCalledOnce();
    await new Promise(resolve => setTimeout(resolve, 30));
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: frame.contentWindow, data: { channel: RADIO_CHANNEL, type: 'snapshot', value: { current: null, playing: false, loading: false, profile, locale: 'en' } } }));
    expect(sent).toHaveBeenLastCalledWith({ channel: RADIO_CHANNEL, type: 'command', value: { kind: 'play', stationId: 'fixture' } }, window.location.origin);
    const play = vi.fn(), toggle = vi.fn();
    const controller = { current: null, stations: [], profile, play, toggle } as unknown as RadioController;
    executePlayerCommand(controller, { kind: 'play', stationId: 'unknown' }); expect(play).not.toHaveBeenCalled();
    executePlayerCommand(controller, { kind: 'play', stationId: 'fixture' }); expect(play).toHaveBeenCalledWith(station);
    executePlayerCommand(controller, { kind: 'toggle' }); expect(toggle).toHaveBeenCalledOnce();
  });
  it('retains volume/channel without changing existing taste/theme keys and rejects invalid values', () => {
    const storage = createLocalStorage();
    storage.savePreferences!({ volume: 0.23, mood: 'jazz' }); storage.saveTheme('rams');
    expect(createLocalStorage().loadPreferences!()).toEqual({ volume: 0.23, mood: 'jazz' });
    expect(storage.loadProfile().history[0].station.id).toBe('fixture'); expect(storage.loadTheme()).toBe('rams');
    storage.savePreferences!({ volume: -1, mood: 'jazz' });
    expect(storage.loadPreferences!()?.volume).toBe(0.23);
  });
  it('archives malformed history exactly before normalization and preserves raw data if the backup fails', () => {
    const original = '{broken-json'; localStorage.setItem('qiaomu-radio-profile-v1', original);
    const storage = createLocalStorage(); expect(storage.loadProfile().history).toEqual([]);
    storage.saveProfile(EMPTY_PROFILE);
    const recovery = Object.keys(localStorage).filter(key => key.startsWith('qiaomu-radio-profile-v1-recovery-'));
    expect(recovery).toHaveLength(1); expect(localStorage.getItem(recovery[0])).toBe(original);
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem('qiaomu-radio-profile-v1', '{another-corrupt-value');
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key.includes('-recovery-')) throw Error('quota'); setItem(key, value); });
    const blocked = createLocalStorage(); blocked.loadProfile(); blocked.saveProfile(EMPTY_PROFILE);
    expect(localStorage.getItem('qiaomu-radio-profile-v1')).toBe('{another-corrupt-value');
  });
});
