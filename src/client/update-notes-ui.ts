import { createElement, History, X, RotateCcw } from "lucide";
/** The small native-UI seam required by the original offline update-note component. */
export type App = { container(): HTMLElement; vault: { configDir: string; adapter: any }; workspace: { onLayoutReady(run: () => void): void } };
export interface Plugin { app: App; manifest: { id: string; name: string; version: string }; register(fn: () => void): void; addCommand(command: { id: string; name: string; callback(): void }): void }
type Options = { text?: string; cls?: string; attr?: Record<string, string> };
declare global {
  interface HTMLElement {
    createEl<K extends keyof HTMLElementTagNameMap>(tag: K, options?: Options): HTMLElementTagNameMap[K];
    createDiv(options?: Options): HTMLDivElement;
    createSpan(options?: Options): HTMLSpanElement;
    addClass(name: string): void;
    empty(): void;
  }
}
export function enhance<T extends HTMLElement>(element: T): T {
  Object.assign(element, {
    createEl(tag: string, options: Options = {}) {
      const child = enhance(document.createElement(tag));
      if (options.cls) child.className = options.cls;
      if (options.text !== undefined) child.textContent = options.text;
      for (const [name,value] of Object.entries(options.attr || {})) child.setAttribute(name,value);
      element.append(child); return child;
    },
    createDiv: (options?: Options) => element.createEl('div', options),
    createSpan: (options?: Options) => element.createEl('span', options),
    addClass: (name: string) => element.classList.add(name),
    empty: () => element.replaceChildren(),
  });
  return element;
}
export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
export const getLanguage = () => document.documentElement.lang || navigator.language;
export function setIcon(element: HTMLElement, name: string) {
  const icon = createElement(name === 'x' ? X : name === 'rotate-ccw' ? RotateCcw : History, { 'aria-hidden': 'true', width: '18', height: '18' });
  element.replaceChildren(icon);
}

export class Notice {
  constructor(text: string) {
    const node = document.createElement('div'); node.className = 'radio-notice has-error'; node.role = 'alert'; node.textContent = text;
    (document.querySelector('.radio-root') || document.body).append(node);
    window.setTimeout(() => node.remove(), 5000);
  }
}
export class Modal {
  modalEl = enhance(document.createElement('div'));
  contentEl = enhance(document.createElement('div'));
  private overlay = document.createElement('div');
  private title = document.createElement('h2');
  private previous: HTMLElement | null = null;
  private opened = false;
  constructor(public app: App) {
    this.overlay.className = 'qiaomu-update-overlay modal-container';
    this.modalEl.className = 'modal'; this.modalEl.setAttribute('role','dialog'); this.modalEl.setAttribute('aria-modal','true'); this.modalEl.tabIndex = -1;
    this.title.className = 'modal-title'; this.title.id = 'radio-update-title-' + crypto.randomUUID();
    this.modalEl.setAttribute('aria-labelledby', this.title.id); this.contentEl.className = 'modal-content';
    this.modalEl.append(this.title,this.contentEl); this.overlay.append(this.modalEl);
    this.overlay.addEventListener('pointerdown', event => { if (event.target === this.overlay) this.close(); });
  }
  setTitle(title: string) { this.title.textContent = title; }
  private key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.close(); return; }
    if (this.overlay.contains(event.target as Node)) event.stopPropagation();
    if (event.key !== 'Tab') return;
    const targets = [...this.modalEl.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href]')];
    const first = targets[0], last = targets.at(-1);
    if (!first) { event.preventDefault(); this.modalEl.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === this.modalEl)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  open() {
    if (this.opened) return;
    this.opened = true; this.previous = document.activeElement as HTMLElement;
    this.app.container().append(this.overlay); window.addEventListener('keydown', this.key, true);
    this.onOpen(); this.modalEl.focus();
  }
  close() {
    if (!this.opened) return;
    this.opened = false; window.removeEventListener('keydown', this.key, true);
    this.onClose(); this.overlay.remove(); if (this.previous?.isConnected) this.previous.focus();
  }
  onOpen() {}
  onClose() {}
}
