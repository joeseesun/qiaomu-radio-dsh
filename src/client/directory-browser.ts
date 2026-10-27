/** Original Radio 1.2.4 browse renderer; only its surrounding host lifecycle is adapted. */
import { BROWSE_GROUPS, LANGUAGES, REGIONS, genreLabel, type DirectoryFilter } from '../original/catalog';
import { resolveLocale, translate, displayName } from '../original/i18n';
import { enhance, setIcon } from './update-notes-ui';
export class RadioDirectoryBrowser {
  private browseOpen = false;
  private browseDraft: DirectoryFilter = {};
  private browseFilter: DirectoryFilter = {};
  private channel = 'recommend';
  private directoryQuery = '';
  private filterQuery = '';
  private previous: HTMLElement | null = null;
  private containerEl = enhance(document.createElement('div'));
  private plugin: { data: { settings: { language: string } } };
  constructor(language: string, private apply: (filter: DirectoryFilter) => void) {
    this.plugin = { data: { settings: { language: language.split(/[-_]/)[0] } } };
    this.containerEl.className = 'qiaomu-radio radio-directory-host modal-container';
    this.containerEl.dataset.theme = 'classic';
    this.containerEl.dir = language === 'ar' ? 'rtl' : 'ltr';
    this.containerEl.addEventListener('keydown', event => event.stopPropagation());
  }
  private t(source: string) { return translate(source, resolveLocale(this.plugin.data.settings.language)); }
  private addScreenReaderText(element: HTMLElement, text: string) { element.createSpan({ cls: 'qiaomu-radio__sr-only', text }); }
  private loadStations() { const filter = { ...this.browseFilter }; this.close(); this.apply(filter); }
  private render() { if (!this.browseOpen) this.close(); }
  open(filter: DirectoryFilter = {}) {
    this.close(); this.previous = document.activeElement as HTMLElement;
    this.browseOpen = true; this.browseDraft = { ...filter };
    this.renderBrowse(this.containerEl);
    (document.querySelector('.radio-root') || document.body).append(this.containerEl);
    this.containerEl.querySelector<HTMLElement>('button')?.focus();
  }
  close() {
    this.browseOpen = false; this.containerEl.remove(); this.containerEl.replaceChildren();
    if (this.previous?.isConnected) this.previous.focus(); this.previous = null;
  }
// BEGIN ORIGINAL BROWSE METHODS
  private renderBrowse(directory: HTMLElement): void {
    const layer = directory.createDiv({ cls: "qiaomu-radio__browse-layer" });
    const panel = layer.createDiv({ cls: "qiaomu-radio__browse-panel", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "qiaomu-browse-heading" } });
    const close = (): void => {
      this.browseOpen = false;
      this.render();
      this.containerEl.querySelector<HTMLElement>('[data-focus-key="browse"]')?.focus({ preventScroll: true });
    };
    layer.addEventListener("click", event => { if (event.target === layer) close(); });
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === "Tab") {
        const buttons = Array.from(panel.querySelectorAll<HTMLElement>("button, summary")).filter(element => element.getClientRects().length > 0);
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = panel.ownerDocument.activeElement;
        if (event.shiftKey && active === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus(); }
      }
    });
    const head = panel.createDiv({ cls: "qiaomu-radio__browse-head" });
    head.createEl("h2", { text: this.t("浏览电台"), attr: { id: "qiaomu-browse-heading" } });
    const dismiss = head.createEl("button");
    setIcon(dismiss, "x");
    this.addScreenReaderText(dismiss, this.t("关闭分类"));
    dismiss.addEventListener("click", close);
    const apply = (): void => {
      this.browseFilter = { ...this.browseDraft };
      this.channel = "recommend";
      this.directoryQuery = "";
      this.filterQuery = "";
      this.browseOpen = false;
      void this.loadStations();
      this.containerEl.querySelector<HTMLElement>('[data-focus-key="browse"]')?.focus({ preventScroll: true });
    };
    const body = panel.createDiv({ cls: "qiaomu-radio__browse-body" });
    const group = (parent: HTMLElement, label: string, key: keyof DirectoryFilter, items: readonly (readonly [string, string])[]): void => {
      const section = parent.createEl("section");
      section.createEl("h3", { text: this.t(label) });
      const choices = section.createDiv({ cls: "qiaomu-radio__browse-choices" });
      for (const [value, text] of items) {
        const button = choices.createEl("button", { text: this.filterLabel(key, value) || this.t(text), attr: { "aria-pressed": String((this.browseDraft[key] || "") === value), "data-filter-key": key, "data-filter-value": value, "data-focus-key": `filter-${key}-${value}` } });
        button.addEventListener("click", () => {
          if (value) this.browseDraft[key] = value;
          else delete this.browseDraft[key];
          panel.querySelectorAll<HTMLElement>(`[data-filter-key="${key}"]`).forEach(element => element.setAttribute("aria-pressed", String(element.dataset.filterValue === value)));
          reset.disabled = Object.keys(this.browseDraft).length === 0;
        });
      }
    };
    for (const category of BROWSE_GROUPS) group(body, category.label, "tag", category.items);
    const advanced = body.createEl("details", { cls: "qiaomu-radio__browse-advanced" });
    advanced.open = !!(this.browseDraft.country || this.browseDraft.language);
    advanced.createEl("summary", { text: this.t("语言与地区") });
    group(advanced, this.t("语言"), "language", LANGUAGES);
    group(advanced, this.t("地区"), "country", REGIONS);
    const footer = panel.createDiv({ cls: "qiaomu-radio__browse-footer" });
    const reset = footer.createEl("button", { cls: "qiaomu-radio__browse-reset" });
    setIcon(reset.createSpan({ attr: { "aria-hidden": "true" } }), "rotate-ccw");
    reset.createSpan({ text: this.t("清除筛选") });
    reset.disabled = !Object.keys(this.browseDraft).length;
    reset.addEventListener("click", () => {
      this.browseDraft = {};
      panel.querySelectorAll<HTMLElement>("[data-filter-key]").forEach(element => element.setAttribute("aria-pressed", String(element.dataset.filterValue === "")));
      reset.disabled = true;
    });
    const show = footer.createEl("button", { text: this.t("查看电台"), cls: "qiaomu-radio__browse-apply" });
    show.addEventListener("click", apply);
  }

  private filterLabel(key: keyof DirectoryFilter, value?: string): string {
    if (!value) return "";
    if (key === "tag") return this.t(genreLabel(value));
    const locale = resolveLocale(this.plugin.data.settings.language);
    const languageCodes: Record<string, string> = { chinese: "zh", english: "en", japanese: "ja", french: "fr", german: "de", spanish: "es" };
    return displayName(key === "country" ? value : languageCodes[value] || value, key === "country" ? "region" : "language", locale, value);
  }

// END ORIGINAL BROWSE METHODS
}
