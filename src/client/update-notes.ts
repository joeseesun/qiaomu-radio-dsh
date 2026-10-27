import { useEffect, useRef } from 'react';
import { UpdateNotes } from '../original/update-notes';
import type { App, Plugin } from './update-notes-ui';
import packageInfo from '../../package.json';
export function createRadioUpdateNotes(language: () => string, storage: Storage = localStorage) {
  const cleanups: Array<() => void> = [], commands: Record<string, () => void> = {};
  const app: App = {
    container: () => document.querySelector<HTMLElement>('.radio-root') || document.body,
    vault: { configDir: 'Config', adapter: {
      exists: async (path: string) => storage.getItem('qiaomu-radio-dsh/' + path) !== null,
      read: async (path: string) => storage.getItem('qiaomu-radio-dsh/' + path),
      write: async (path: string, value: string) => { storage.setItem('qiaomu-radio-dsh/' + path, value); },
    } },
    workspace: { onLayoutReady: run => queueMicrotask(run) },
  };
  const plugin: Plugin = {
    app, manifest: { id: 'qiaomu-radio', name: 'Qiaomu Radio', version: packageInfo.version },
    register: fn => { cleanups.push(fn); }, addCommand: command => { commands[command.id] = command.callback; },
  };
  const notes = new UpdateNotes(plugin, [{ version: '0.2.0', items: ['introduced','revisit','control'] }], language);
  return { show: () => notes.show(), commands, dispose: () => { for (const cleanup of cleanups.reverse()) cleanup(); } };
}
export function useRadioUpdateNotes(language: string) {
  const currentLanguage = useRef(language); currentLanguage.current = language;
  const notes = useRef<ReturnType<typeof createRadioUpdateNotes> | null>(null);
  useEffect(() => {
    notes.current = createRadioUpdateNotes(() => currentLanguage.current);
    return () => { notes.current?.dispose(); notes.current = null; };
  }, []);
  return () => notes.current?.show();
}
