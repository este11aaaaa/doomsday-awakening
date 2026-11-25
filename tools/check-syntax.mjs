/**
 * tools/check-syntax.mjs — 逐文件语法检查（Node 自带解析器，ESM 模式）
 * 用法：node tools/check-syntax.mjs
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(p);
  }
}

walk(join(root, 'js'));
files.push(join(root, 'tools', 'check-syntax.mjs'));

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log(`  ok   ${relative(root, f)}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${relative(root, f)}`);
    console.error(String(err.stderr || err.message).trim());
  }
}

console.log(`\n语法检查：${files.length} 个文件，失败 ${failed} 个`);
process.exit(failed ? 1 : 0);
