import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
it('retains original source with only the documented import and type seams', () => {
  const manifest = JSON.parse(read('vendor/qiaomu-radio/source.json'));
  for (const [path, hash] of Object.entries(manifest.files)) {
    let source = read('src/original/' + path.split('/').at(-1));
    for (const [before, after] of [...(manifest.patches[path] || [])].reverse()) {
      expect(source.includes(after), path).toBe(true); source = source.replace(after, before);
    }
    expect(sha(source), path).toBe(hash);
  }
  const css = read('styles/40-update-notes.css');
  const original = css.split('@scope (.radio-root) {\n')[1].replace(/\n}\n$/, '');
  expect(sha(original)).toBe(manifest.updateNotesStylesSha256);
  const methods = read('src/client/directory-browser.ts').split('// BEGIN ORIGINAL BROWSE METHODS\n')[1].split('// END ORIGINAL BROWSE METHODS')[0];
  expect(sha(methods)).toBe(manifest.fragments.browseMethods.sha256);
  const browseCss = read('styles/41-directory.css').split('@scope (.radio-directory-host) {\n')[1].split('\n}\n.radio-root')[0];
  expect(sha(browseCss)).toBe(manifest.fragments.browseStyles.sha256);
});
