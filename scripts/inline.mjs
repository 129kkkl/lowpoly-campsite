/**
 * 把 Vite 构建产物内联成一个可以直接双击打开的 HTML 文件。
 * 产物：dist/campsite-standalone.html
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const entry = join(dist, 'index.html');

if (!existsSync(entry)) {
  console.error('[inline] 找不到 dist/index.html，请先执行 vite build');
  process.exit(1);
}

let html = readFileSync(entry, 'utf8');
const assetsDir = join(dist, 'assets');
const assets = existsSync(assetsDir) ? readdirSync(assetsDir) : [];

// 内联 CSS
html = html.replace(
  /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (match, href) => {
    const file = join(dist, href.replace(/^\.?\//, ''));
    if (!existsSync(file)) return match;
    const css = readFileSync(file, 'utf8').replace(/<\/style/gi, '<\\/style');
    return `<style>\n${css}\n</style>`;
  }
);

// 内联 JS
html = html.replace(
  /<script([^>]*?)src="([^"]+)"([^>]*)><\/script>/g,
  (match, before, src, after) => {
    const file = join(dist, src.replace(/^\.?\//, ''));
    if (!existsSync(file)) return match;
    const js = readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script');
    return `<script type="module">\n${js}\n</script>`;
  }
);

const out = join(dist, 'campsite-standalone.html');
writeFileSync(out, html, 'utf8');

const kb = (statSync(out).size / 1024).toFixed(0);
console.log(`[inline] 生成 ${out} (${kb} KB, 内联资源 ${assets.length} 个)`);
console.log('[inline] 该文件可直接双击在浏览器中打开，无需服务器。');
