/**
 * tools/github-upload.mjs — 通过 GitHub Contents API 上传本地仓库文件
 * 用于当前环境 git 协议（github.com:443）被封锁时，改用 api.github.com 上传。
 * 用法：GH_TOKEN=xxx node tools/github-upload.mjs <owner> <repo> <localDir>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [owner, repo, rootDir] = process.argv.slice(2);
const token = process.env.GH_TOKEN;
if (!owner || !repo || !rootDir || !token) {
  console.error('用法: GH_TOKEN=xxx node github-upload.mjs <owner> <repo> <localDir>');
  process.exit(1);
}

const API = `https://api.github.com/repos/${owner}/${repo}/contents`;
const HEADERS = {
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json'
};

// 需要跳过的目录/文件（.git、临时文件等）
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const SKIP_FILES = (name) => name.startsWith('.tmp-') || name === '.gitignore.bak';

function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push(...walk(full, rel));
    } else {
      if (SKIP_FILES(name)) continue;
      out.push({ rel, full, size: st.size });
    }
  }
  return out;
}

const files = walk(rootDir);
console.log(`待上传 ${files.length} 个文件，总大小 ${(files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(2)} MB`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fail = 0;
const failed = [];

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const content = readFileSync(f.full).toString('base64');
  const body = {
    message: `Add ${f.rel}`,
    content,
    branch: 'main'
  };

  let status = 0, respText = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API + '/' + f.rel.split('/').map(encodeURIComponent).join('/'), {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000)
      });
      status = res.status;
      respText = await res.text();
      if (res.ok || status === 422) break; // 422 = 文件已存在（理论上新仓库不会）
      await sleep(1000 * (attempt + 1));
    } catch (err) {
      respText = String(err);
      await sleep(1000 * (attempt + 1));
    }
  }

  if (status >= 200 && status < 300) {
    ok++;
    if ((i + 1) % 20 === 0 || i === files.length - 1) console.log(`  [${i + 1}/${files.length}] 已上传 ${f.rel}`);
  } else {
    fail++;
    failed.push({ rel: f.rel, status, resp: respText.slice(0, 200) });
    console.log(`  ✗ 失败 ${f.rel} (${status})`);
  }
  // GitHub API 速率限制保守间隔
  await sleep(120);
}

console.log(`\n完成: 成功 ${ok} / 失败 ${fail}`);
if (failed.length) {
  console.log('失败明细:');
  for (const x of failed) console.log(`  ${x.rel} — HTTP ${x.status} — ${x.resp}`);
  process.exit(1);
}
