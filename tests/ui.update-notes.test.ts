// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadioUpdateNotes } from '../src/client/update-notes';
const key = 'qiaomu-radio-dsh/Config/plugins/qiaomu-radio/update-notes.json';
let notes: ReturnType<typeof createRadioUpdateNotes> | undefined;
const pump = async () => { await vi.advanceTimersByTimeAsync(650); };
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); document.body.innerHTML = '<main class="radio-root"><button id="return">Return</button></main>'; });
afterEach(() => { notes?.dispose(); notes = undefined; vi.clearAllTimers(); vi.useRealTimers(); document.body.replaceChildren(); });
describe('original offline update notes in the radio host', () => {
  it('shows original content once per version, retains the preference, and restores keyboard focus', async () => {
    const button = document.querySelector<HTMLButtonElement>('#return')!; button.focus();
    notes = createRadioUpdateNotes(() => 'zh-CN'); await pump();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull(); expect(dialog.classList.contains('qiaomu-update-notes')).toBe(true);
    expect(dialog.querySelectorAll('li')).toHaveLength(3);
    expect(dialog.textContent).toContain('0.2.0');
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ seenVersion: '0.2.0', autoShow: true });
    const checkbox = dialog.querySelector<HTMLInputElement>('input')!;
    checkbox.checked = false; checkbox.dispatchEvent(new Event('change')); await pump();
    expect(JSON.parse(localStorage.getItem(key)!).autoShow).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button);
    notes.dispose(); notes = createRadioUpdateNotes(() => 'en'); await pump();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    notes.commands['view-update-notes'](); await pump();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    notes.dispose(); expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves unreadable metadata while still allowing a manual view', async () => {
    localStorage.setItem(key, '{broken'); notes = createRadioUpdateNotes(() => 'zh-CN'); await pump();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    notes.show(); await pump(); expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(localStorage.getItem(key)).toBe('{broken');
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('cancels a queued automatic dialog when the player is disposed', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="modal-container"></div>');
    notes = createRadioUpdateNotes(() => 'en'); await pump(); notes.dispose();
    document.querySelector('.modal-container')!.remove(); await pump();
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    expect(localStorage.getItem(key)).toBeNull();
  });
});
