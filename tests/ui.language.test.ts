// @vitest-environment happy-dom
import { expect, it, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { I18nProvider, LOCALES, message, useI18n, type I18nValue } from '../src/core/i18n';
let root: Root | undefined, value: I18nValue;
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); localStorage.clear(); });
it('offers all ten original languages and preserves system-following selection across reloads', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  expect(LOCALES).toHaveLength(10); expect(message('ko', 'mood.recommend')).toBe('추천');
  const mount = async () => {
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    function Probe() { value = useI18n(); return createElement('span', null, value.t('action.play')); }
    await act(async () => root!.render(createElement(I18nProvider, null, createElement(Probe))));
  };
  localStorage.setItem('qiaomu-radio-locale-v1', 'auto'); await mount();
  expect(value!.languageSetting).toBe('auto'); expect(localStorage.getItem('qiaomu-radio-locale-v1')).toBe('auto');
  await act(async () => value.setLocale('ar'));
  expect(document.documentElement.dir).toBe('rtl'); expect(value!.t('action.play')).toBe('تشغيل');
  await act(async () => root!.unmount()); root = undefined; await mount();
  expect(value!.languageSetting).toBe('ar'); expect(value!.locale).toBe('ar');
  await act(async () => value.setLocale('auto'));
  expect(localStorage.getItem('qiaomu-radio-locale-v1')).toBe('auto');
});
