/**
 * The player page served from the plugin's own host routes.
 *
 * A classic, no-framework document: the built player bundle plus its stylesheet,
 * one runtime config object, and a server-rendered fallback for the case where
 * JavaScript is unavailable.
 */

/** Inline dial glyph, so the page never asks the host for `/favicon.ico`. */
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<circle cx="16" cy="16" r="11" fill="none" stroke="#8a8f98" stroke-width="2.4"/>' +
      '<circle cx="16" cy="16" r="3" fill="#8a8f98"/>' +
      '<path d="M21.5 10.5 17.6 14.4" stroke="#8a8f98" stroke-width="2.4" stroke-linecap="round"/>' +
      "</svg>",
  );

export type PlayerPageOptions = {
  /** Mount path the client should use as its API base. */
  baseUrl: string;
  /** Player bundle filename inside the asset directory. */
  script?: string;
  /** Stylesheet filename inside the asset directory. */
  style?: string;
  /** Document title. */
  title?: string;
  /** How the page presents the player. */
  presentation?: string;
  /**
   * Cache-busting token appended to the script and stylesheet URLs.
   *
   * `routes.ts` serves `.js`/`.css` with `max-age=3600`, so without a token an
   * upgraded plugin keeps serving the *previous* bundle from the browser cache
   * for up to an hour — the user restarts the app and still sees the old UI.
   */
  version?: string;
  /** Extra inline configuration handed to the player before it boots. */
  config?: Record<string, unknown>;
};

const DEFAULTS = {
  script: "app.js",
  style: "styles.css",
  title: "乔木电台 · 此刻，听点什么",
};

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Page shell reset.
 *
 * The player stylesheet is scoped to `.radio-root` on purpose (it has to be safe
 * to mount inside the harness page), so the standalone document resets its own
 * canvas here: the UA's default 8px body margin otherwise shows up as a white
 * frame around every skin, and a dark system appearance would let the UA repaint
 * the canvas behind the player.
 *
 * `--radio-bg` is declared on `.radio-root`, not on `:root`, so the `body` rule
 * cannot read it. The shell therefore mirrors the six theme values literally and
 * keeps them in sync through the theme attribute that the app puts on the mount
 * element (`[data-theme]` on `#radio-root`). The body sits *behind* the root, so
 * these values are only ever visible once the player has painted its own themed
 * background — matching them just avoids a one-frame flash of the fallback grey
 * when switching to a dark environment.
 */
const PAGE_SHELL_CSS = [
  "html,body.radio-page{margin:0;padding:0;min-height:100%;}",
  "body.radio-page{background:#d9d8cf;color:#2b2f28;color-scheme:light;}",
  "body.radio-page #radio-root{min-height:100svh;}",
  "body.radio-page:has(main.radio-root[data-theme=editorial]){background:#eeeae2;}",
  "body.radio-page:has(main.radio-root[data-theme=rams]){background:#e3e2d8;}",
  "body.radio-page:has(main.radio-root[data-theme=pocket]){background:#e8e8e3;}",
  "body.radio-page:has(main.radio-root[data-theme=deck]){background:#232630;}",
  "body.radio-page:has(main.radio-root[data-theme=console]){background:#373b3e;}",
  "body.radio-page:has(main.radio-root[data-theme=fantasy]){background:#121317;}",
].join("");

/** Render the complete player document. */
export function renderPlayerPage(options: PlayerPageOptions): string {
  const script = options.script ?? DEFAULTS.script;
  const style = options.style ?? DEFAULTS.style;
  const title = options.title ?? DEFAULTS.title;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const suffix = options.version ? `?v=${encodeURIComponent(options.version)}` : "";
  const config = {
    baseUrl,
    presentation: "page",
    ...options.config,
  };
  return `<!doctype html>
<html lang="zh-CN" data-radio-page="1">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light" />
    <meta name="robots" content="noindex" />
    <meta name="description" content="在 DeepSeek Harness 里发现和收听全球直播电台，六种播放器环境。" />
    <title>${escapeAttribute(title)}</title>
    <style>${PAGE_SHELL_CSS}</style>
    <link rel="stylesheet" href="${escapeAttribute(`${baseUrl}/${style}${suffix}`)}" />
    <link rel="icon" href="${FAVICON}" />
  </head>
  <body class="radio-page">
    <div id="radio-root" class="radio-page-root">
      <noscript>
        <div class="radio-noscript">
          <h1>乔木电台</h1>
          <p>这个播放器需要 JavaScript。请在浏览器中启用后重新打开。</p>
        </div>
      </noscript>
    </div>
    <script>window.__DSH_RADIO__ = ${JSON.stringify(config)};</script>
    <script type="module" src="${escapeAttribute(`${baseUrl}/${script}${suffix}`)}"></script>
  </body>
</html>
`;
}