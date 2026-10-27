// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { RadioDirectoryBrowser } from '../src/client/directory-browser';
import { createRadioService } from '../src/host/catalog';
import { createRadioApi } from '../src/client/transport';
let browser: RadioDirectoryBrowser;
beforeEach(() => { document.body.innerHTML = '<main class="radio-root"><button id="browse">Browse</button></main>'; });
afterEach(() => { browser?.close(); document.body.replaceChildren(); });
it('uses the original classification controls, applies combined filters, resets and cancels without mutating input', () => {
  const apply = vi.fn(), trigger = document.querySelector<HTMLElement>('#browse')!;
  trigger.focus(); browser = new RadioDirectoryBrowser('zh-CN', apply);
  const filter = { country: 'JP' }; browser.open(filter);
  const click = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!.click();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('浏览电台');
  click('[data-filter-key="tag"][data-filter-value="jazz"]');
  click('[data-filter-key="language"][data-filter-value="japanese"]');
  click('.qiaomu-radio__browse-apply');
  expect(apply).toHaveBeenCalledWith({ tag: 'jazz', country: 'JP', language: 'japanese' });
  expect(filter).toEqual({ country: 'JP' }); expect(document.activeElement).toBe(trigger);
  browser.open(filter); click('.qiaomu-radio__browse-reset'); click('.qiaomu-radio__browse-apply');
  expect(apply).toHaveBeenLastCalledWith({});
  browser.open(filter); document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(apply).toHaveBeenCalledTimes(2);
});
it('separates directory cache keys and sends exact language/country/tag filters without adding mood tags', async () => {
  const urls: URL[] = [];
  const service = createRadioService({ fetchImpl: (async (url: string) => { urls.push(new URL(url)); return new Response('[]', { headers: { 'content-type': 'application/json' } }); }) as typeof fetch });
  const request = { mood: 'recommend' as const, source: 'radio-browser' as const, filter: { country: 'JP', language: 'japanese', tag: 'jazz' } };
  await service.catalog(request); await service.catalog(request);
  expect(urls).toHaveLength(1); expect(urls[0].searchParams.get('countrycode')).toBe('JP');
  expect(urls[0].searchParams.get('tag')).toBe('jazz'); expect(urls[0].searchParams.get('languageExact')).toBe('true');
  await service.catalog({ ...request, filter: { country: 'DE' } });
  expect(urls).toHaveLength(2); expect(urls[1].searchParams.has('tag')).toBe(false);
});
it('keeps zero-result and failed filtered searches empty through Host and client fallback paths', async () => {
  const service = createRadioService({ fetchImpl: (async () => { throw Error('offline fixture'); }) as typeof fetch });
  const input = { mood: 'recommend' as const, source: 'radio-browser' as const, filter: { tag: 'news' } };
  expect((await service.catalog(input)).stations).toEqual([]);
  const api = createRadioApi({ kind: 'rpc', call: async () => ({ stations: [], source: 'radio-browser', cached: false }) });
  expect((await api.catalogSafe(input)).stations).toEqual([]);
  const offline = createRadioApi({ kind: 'rpc', call: async () => { throw Error('offline fixture'); } });
  expect((await offline.catalogSafe(input)).stations).toEqual([]);
  expect((await offline.catalogSafe({ ...input, filter: {} })).stations.length).toBeGreaterThan(0);
});
