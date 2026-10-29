// Standalone, loopback-only synthetic server. No production entry point imports this file.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixture, scenes, createId } from './ui-preview/fixtures.mjs';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(repo, '.ui-preview-dist');
const port = Number(process.env.UI_PREVIEW_PORT ?? 4175);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid UI_PREVIEW_PORT');
// An explicit empty API base overrides .env files and shell settings; production dist is untouched.
const built = spawnSync(process.execPath, [resolve(repo, 'node_modules/vite/bin/vite.js'), 'build', '--configLoader', 'runner', '--outDir', dist], { cwd: repo, env: { ...process.env, VITE_API_BASE_URL: '' }, stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);
const sessions = new Map();
const origin = `http://127.0.0.1:${port}`;
const css = 'body{margin:0;background:#f8fafc;color:#172033;font:16px/1.7 system-ui,sans-serif}main{max-width:900px;margin:64px auto;padding:24px}h1{font-size:32px}ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;padding:0;list-style:none}a{color:#0369a1}li a{display:block;padding:16px;background:white;border:1px solid #dce3ec;border-radius:12px}a:focus-visible{outline:3px solid #0369a1;outline-offset:3px}.ui-preview-banner{padding:8px 16px;background:#e0f2fe;color:#075985;font:13px/1.6 system-ui,sans-serif}.ui-preview-banner a{color:inherit;margin-left:12px}';
const bannerCss = css.slice(css.indexOf('.ui-preview-banner'));
const csp = "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";
const html = body => `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meet me · 로컬 UI 검토</title><style>${css}</style>${body}</html>`;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Security-Policy', csp); res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type }); res.end(type.startsWith('application/json') ? JSON.stringify(body) : body); };
  // Reject cross-origin requests and DNS rebinding; this server never proxies anything.
  if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin && req.headers.origin !== origin) return send(403, { detail: 'Loopback preview only' });
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/__preview') {
      const scene = url.searchParams.get('scene');
      if (scene && Object.hasOwn(scenes, scene)) {
        if (sessions.size >= 50) sessions.delete(sessions.keys().next().value);
        const sid = createId(); sessions.set(sid, fixture(scene));
        res.setHeader('Set-Cookie', `ui_preview=${sid}; HttpOnly; SameSite=Strict; Path=/`);
        res.writeHead(303, { Location: scenes[scene][1] }); return res.end();
      }
      return send(200, html(`<main><p>MEET ME · LOCAL PREVIEW</p><h1>밝은 UI를 둘러보세요.</h1><p>아래 화면은 모두 합성 데이터입니다. 실제 로그인·서버·AI를 사용하지 않아요.<br>화면을 다시 선택하면 입력과 상태가 초기화됩니다. 실제 개인정보는 입력하지 마세요.</p><ul>${Object.entries(scenes).map(([key, [label]]) => `<li><a href="/__preview?scene=${key}">${label}</a></li>`).join('')}</ul><p>제출은 정해진 성공 응답으로, 마감은 추천 화면으로 이어집니다. 실제 해석 품질이나 서버 동작 검증용이 아닙니다. 같은 브라우저의 탭은 합성 세션을 공유합니다.</p></main>`), 'text/html; charset=utf-8');
    }
    if (url.pathname.startsWith('/api/')) {
      const sid = (req.headers.cookie ?? '').split('; ').find(value => value.startsWith('ui_preview='))?.slice(11);
      const handler = sessions.get(sid);
      if (!handler) return send(401, { code: 'AUTH_REFRESH_INVALID', detail: '화면 목록에서 합성 화면을 선택해 주세요.' });
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) return send(413, { detail: 'Preview request too large' }); }
      const [status, value] = await handler(req.method, url, body ? JSON.parse(body) : {});
      if (status === 409 && /^\/api\/auth\/(google|kakao)\/start$/.test(url.pathname)) {
        return send(409, html('<main><h1>로컬 로그인 미리보기</h1><p>실제 로그인은 연결하지 않습니다. 합성 계정 화면에서 로그인 이후의 UI를 확인하세요.</p><p><a href="/__preview">합성 화면 목록으로</a></p></main>'), 'text/html; charset=utf-8');
      }
      return send(status, value);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { detail: 'Unsupported preview method' });
    const target = resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (target !== dist && !target.startsWith(dist + sep)) return send(404, {});
    const exists = await stat(target).then(value => value.isFile()).catch(() => false);
    if (exists && extname(target) !== '.html') {
      const type = ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(target)] ?? 'application/octet-stream';
      return send(200, await readFile(target), type);
    }
    const source = await readFile(resolve(dist, 'index.html'), 'utf8');
    return send(200, source.replace('</head>', `<style>${bannerCss}</style></head>`).replace('<body>', '<body><div class="ui-preview-banner">로컬 UI 검토 · 합성 데이터 <a href="/__preview">화면 목록·초기화</a></div>'), 'text/html; charset=utf-8');
  } catch { return send(400, { detail: 'Invalid preview request' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local synthetic UI: ${origin}/__preview\nStop with Ctrl+C. No data is written to disk.`));
