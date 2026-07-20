/* =========================================================================
 * github-sync.js — 비공개 GitHub 저장소를 JSON DB로 사용하는 동기화 모듈
 * -------------------------------------------------------------------------
 * 설정(저장소 링크 / JSON 경로 / PAT)은 이 브라우저(localStorage)에만 저장.
 * 공개 저장소 코드에는 개인정보·기본 저장소가 하드코딩되지 않는다.
 *   load()        : {state, sha} | null(파일없음)
 *   save(state)   : 성공 시 새 sha. 409/422 → {conflict:true}
 * ========================================================================= */
const GHSync = (function () {
  "use strict";
  const CFG_KEY = "mp_sync_cfg";   // { owner, repo, path, branch, repoUrl }
  const TOK_KEY = "mp_gh_token";
  let lastSha = null;

  const getCfg = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { return {}; } };
  const setCfg = (c) => localStorage.setItem(CFG_KEY, JSON.stringify(c));
  const getToken = () => localStorage.getItem(TOK_KEY) || "";
  const setToken = (t) => { if (t) localStorage.setItem(TOK_KEY, t); else localStorage.removeItem(TOK_KEY); };

  // "https://github.com/owner/repo(.git)" 또는 "owner/repo" → { owner, repo }
  function parseRepo(input) {
    if (!input) return null;
    const s = input.trim().replace(/\.git$/, "");
    const m = s.match(/github\.com[/:]([^/]+)\/([^/\s#?]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }

  const ready = () => { const c = getCfg(); return !!(getToken() && c.owner && c.repo && c.path); };
  const apiUrl = () => { const c = getCfg(); return `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${encodeURI(c.path)}`; };
  const headers = () => ({ Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

  // UTF-8 안전 base64
  function b64e(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ""; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  const b64d = (b64) => new TextDecoder().decode(Uint8Array.from(atob((b64 || "").replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  async function safeMsg(r) { try { return (await r.json()).message; } catch { return r.statusText; } }

  async function load() {
    const c = getCfg();
    const r = await fetch(apiUrl() + `?ref=${c.branch || "main"}`, { headers: headers(), cache: "no-store" });
    if (r.status === 404) { lastSha = null; return null; }
    if (!r.ok) throw { status: r.status, msg: await safeMsg(r) };
    const j = await r.json();
    lastSha = j.sha;
    return { state: JSON.parse(b64d(j.content)), sha: j.sha };
  }

  async function save(state) {
    const c = getCfg();
    const body = {
      message: `plan update ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      content: b64e(JSON.stringify(state, null, 2)),
      branch: c.branch || "main",
    };
    if (lastSha) body.sha = lastSha;
    const r = await fetch(apiUrl(), { method: "PUT", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) throw { conflict: true };
    if (!r.ok) throw { status: r.status, msg: await safeMsg(r) };
    lastSha = (await r.json()).content.sha;
    return lastSha;
  }

  return {
    getCfg, setCfg, getToken, setToken, parseRepo, ready, load, save,
    get lastSha() { return lastSha; }, set lastSha(v) { lastSha = v; },
  };
})();
