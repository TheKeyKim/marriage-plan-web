/* =========================================================================
 * app.js — 결혼 준비 체크리스트
 *  · 개요(한눈에 보기) / 상세 표 두 화면
 *  · 분류: 필터 + 직접 추가/이름변경/삭제
 *  · 돈 계산 · 되돌리기(undo) · JSON 파일 영속성
 * ========================================================================= */
(function () {
  "use strict";

  const KEY = "marriage-plan-v3";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---- 상태 로드 (저장 구조: {meta, categories, rows}; 과거 배열 형태도 허용) ----
  const _saved = loadLocal();
  let cats, rows, meta;
  if (Array.isArray(_saved)) { cats = CATEGORIES.map((c) => ({ ...c })); rows = _saved; }
  else if (_saved && Array.isArray(_saved.rows)) {
    cats = Array.isArray(_saved.categories) ? _saved.categories : CATEGORIES.map((c) => ({ ...c }));
    rows = _saved.rows;
  } else { cats = CATEGORIES.map((c) => ({ ...c })); rows = DEFAULT_ROWS.map((r) => ({ ...r })); }
  meta = { ...META, ...((_saved && _saved.meta) || {}) };

  let sort = { key: null, dir: 1 };
  let view = "overview";          // 'overview' | 'table'
  let catFilter = "all";          // 'all' | category id
  let fileHandle = null;

  // ---- 되돌리기 히스토리 (분류+행 함께 스냅샷) ----
  const history = [];
  let pending = null;
  const snapshot = () => JSON.stringify({ meta, categories: cats, rows });
  // ---- 원격 동기화 상태 ----
  let saveTimer = null, remoteBusy = false, appliedSha = null, fromFilePending = false;
  const currentState = () => ({ meta, categories: cats, rows });
  function pushHistory(snap) {
    history.push(snap != null ? snap : snapshot());
    if (history.length > 50) history.shift();
    refreshUndo();
  }
  const refreshUndo = () => { const b = $("#undoBtn"); if (b) b.disabled = history.length === 0; };
  function undo() {
    if (!history.length) return;
    const s = JSON.parse(history.pop());
    meta = s.meta || meta;
    cats = s.categories || cats;
    rows = s.rows || [];
    pending = null;
    if (catFilter !== "all" && !cats.some((c) => c.id === catFilter)) catFilter = "all";
    render(); save(); refreshUndo();
  }

  // ---- 금액 (완료 = 전액 지불 간주) ----
  const won = (v) => (v == null ? "미정" : v.toLocaleString("ko-KR") + "만원");
  const balance = (r) => (r.done ? 0 : r.price == null ? null : r.price - (r.deposit || 0));
  const paid = (r) => (r.done ? (r.price != null ? r.price : r.deposit || 0) : r.deposit || 0);
  const todo = (r) => (r.done ? 0 : r.price == null ? 0 : r.price - (r.deposit || 0));

  const STATUS_CLS = { "검토중": "s-idea", "예정": "s-plan", "계약": "s-book", "완료": "s-done" };
  const newId = () => "cat_" + Math.random().toString(36).slice(2, 8);

  /* ---------------------- 저장 / 로드 ---------------------- */
  function loadLocal() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  const stateJson = () => JSON.stringify({ meta, categories: cats, rows });
  async function save() {
    localStorage.setItem(KEY, stateJson());
    renderSummary();
    await writeFile();
    scheduleRemoteSave();
  }

  /* ---------------------- 파일 영속성 (JSON) ---------------------- */
  const FS_OK = "showSaveFilePicker" in window;
  const pickerTypes = [{ description: "JSON", accept: { "application/json": [".json"] } }];

  async function connectSave() {
    if (!FS_OK) return downloadJson();
    try {
      fileHandle = await window.showSaveFilePicker({ suggestedName: "marriage-plan.json", types: pickerTypes });
      await writeFile(); markFile();
    } catch (e) { /* 취소 */ }
  }
  async function connectOpen() {
    if (!FS_OK) return $("#importFile").click();
    try {
      [fileHandle] = await window.showOpenFilePicker({ types: pickerTypes });
      const text = await (await fileHandle.getFile()).text();
      pushHistory(); applyImported(JSON.parse(text));
      markFile(); afterFileLoad();
    } catch (e) { /* 취소/실패 */ }
  }
  async function writeFile() {
    if (!fileHandle) return;
    try { const w = await fileHandle.createWritable(); await w.write(JSON.stringify({ meta, categories: cats, rows }, null, 2)); await w.close(); }
    catch (e) { console.warn("파일 저장 실패", e); }
  }
  function markFile() {
    const el = $("#fileStatus");
    el.textContent = fileHandle ? `● 파일 연동됨: ${fileHandle.name}` : "";
    el.classList.toggle("on", !!fileHandle);
  }
  function downloadJson() {
    const blob = new Blob([JSON.stringify({ meta, categories: cats, rows }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "marriage-plan.json"; a.click();
    URL.revokeObjectURL(a.href);
  }
  function applyImported(data) {
    if (Array.isArray(data)) { rows = data; }
    else if (data && Array.isArray(data.rows)) {
      rows = data.rows;
      if (Array.isArray(data.categories)) cats = data.categories;
      if (data.meta) meta = { ...META, ...data.meta };
    } else throw new Error("형식 오류");
    render();
  }

  /* ---------------------- 요약 대시보드 ---------------------- */
  function renderSummary() {
    let total = 0, paidSum = 0, todoSum = 0, unknown = 0;
    rows.forEach((r) => {
      total += r.price != null ? r.price : r.deposit || 0;
      paidSum += paid(r);
      todoSum += todo(r);
      if (r.price == null && !r.done) unknown++;
    });
    const req = rows.filter((r) => r.type === "필수");
    const reqDone = req.filter((r) => r.done).length;
    const allDone = rows.filter((r) => r.done).length;
    const pct = rows.length ? Math.round((allDone / rows.length) * 100) : 0;

    $("#sumTotal").textContent = won(total);
    $("#sumPaid").textContent = won(paidSum);
    $("#sumTodo").textContent = won(todoSum);
    $("#sumUnknown").textContent = unknown ? `※ 금액 미정 ${unknown}건 (총액 일부 미반영)` : "";
    $("#sumRequired").textContent = `${reqDone} / ${req.length}`;
    $("#progressFill").style.width = pct + "%";
    $("#progressText").textContent = `${allDone}/${rows.length} · ${pct}%`;

    $("#coupleLine").textContent = `${meta.groom} · ${meta.bride}  |  ${meta.venue}`;
    renderCountdown();
  }
  function renderCountdown() {
    const t = new Date(meta.date), now = new Date();
    const d = Math.ceil((t - now) / 86400000);
    $("#dday").textContent = isNaN(t) ? "D-—" : d > 0 ? `D-${d}` : d === 0 ? "D-DAY" : `D+${-d}`;
    $("#ddate").textContent = isNaN(t) ? "예식일 미설정" : t.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  }

  /* ---------------------- 원격 동기화 (GitHub · 무조건 원격 우선) ---------------------- */
  function setSyncState(kind, extra) {
    const map = {
      idle: "", loading: "⟳ 불러오는 중…", pending: "… 저장 대기", saving: "⟳ 저장 중…",
      pushed: "✓ 저장됨", pulled: "↓ 원격 불러옴", empty: "원격 비어있어 올림",
      conflict: "↺ 원격 기준으로 갱신됨", fileLoaded: "📄 파일 로드됨 · 🔄로 저장소와 동기화", error: "⚠ 오류",
    };
    let txt = map[kind] != null ? map[kind] : "";
    if (kind === "pulled" && extra != null) txt += ` ${extra}개`;
    if (["pushed", "pulled", "conflict", "empty"].includes(kind)) txt += " · " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    if (kind === "error" && extra) txt += ": " + (extra.msg || extra.status || "");
    const b = $("#syncBadge"); if (b) b.textContent = txt;
    const s = $("#syncState"); if (s) s.textContent = GHSync.ready() ? (txt || "연결됨") : "미연결";
  }
  function scheduleRemoteSave() {
    if (!GHSync.ready() || fromFilePending) return;
    setSyncState("pending");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; doRemoteSave(); }, 2500);
  }
  async function doRemoteSave() {
    if (!GHSync.ready()) return;
    clearTimeout(saveTimer); saveTimer = null;
    remoteBusy = true; setSyncState("saving");
    try {
      await GHSync.save(currentState());
      appliedSha = GHSync.lastSha; setSyncState("pushed");
    } catch (e) {
      if (e && e.conflict) {
        // 원격 우선: 충돌 시 프롬프트 없이 원격을 받아 적용 (내 직전 변경은 ‘되돌리기’로 복구)
        remoteBusy = false;
        await remotePull(true);
        setSyncState("conflict");
      } else setSyncState("error", e);
    } finally { remoteBusy = false; }
  }
  function applyRemote(state) {
    if (!state) return;
    clearTimeout(saveTimer); saveTimer = null;
    if (state.meta) meta = { ...META, ...state.meta };
    if (Array.isArray(state.categories)) cats = state.categories;
    if (Array.isArray(state.rows)) rows = state.rows;
    localStorage.setItem(KEY, stateJson());
    if (catFilter !== "all" && !cats.some((c) => c.id === catFilter)) catFilter = "all";
    render();
  }
  async function remotePull(force) {
    if (!GHSync.ready()) return;
    remoteBusy = true;
    try {
      const res = await GHSync.load();
      if (!res) { if (force) { remoteBusy = false; await doRemoteSave(); } setSyncState("empty"); }
      else if (force || res.sha !== appliedSha) { applyRemote(res.state); appliedSha = res.sha; setSyncState("pulled", (res.state.rows || []).length); }
    } catch (e) { setSyncState("error", e); }
    finally { remoteBusy = false; }
  }
  // 파일로 열기 후: 로컬만 보존, 자동 푸시 보류 (원격과의 방향은 🔄에서 선택)
  function afterFileLoad() {
    localStorage.setItem(KEY, stateJson());
    clearTimeout(saveTimer); saveTimer = null;
    renderSummary();
    fromFilePending = GHSync.ready();
    if (fromFilePending) setSyncState("fileLoaded");
  }
  // 수동 동기화(🔄)
  async function syncNow() {
    if (!GHSync.ready()) { openSettings(); return; }
    if (fromFilePending) {
      remoteBusy = true;
      try {
        const res = await GHSync.load();
        if (!res) { remoteBusy = false; await doRemoteSave(); }                      // 원격 없음 → 파일 내용 올림
        else if (JSON.stringify(res.state) === JSON.stringify(currentState())) {      // 동일 → 그대로
          appliedSha = res.sha; setSyncState("pulled", (res.state.rows || []).length);
        } else {
          const push = confirm("열어둔 파일 내용이 저장소와 다릅니다.\n\n[확인] 파일 내용을 저장소에 저장(밀어넣기)\n[취소] 저장소 내용으로 이 화면 덮어쓰기");
          if (push) { GHSync.lastSha = res.sha; remoteBusy = false; await doRemoteSave(); }   // 파일 → 저장소
          else { applyRemote(res.state); appliedSha = res.sha; setSyncState("pulled", (res.state.rows || []).length); } // 저장소 → 화면
        }
      } catch (e) { setSyncState("error", e); }
      finally { remoteBusy = false; fromFilePending = false; }
      return;
    }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await doRemoteSave(); }
    await remotePull(true);
  }

  /* ---------------------- 설정 모달 ---------------------- */
  function openSettings() {
    const c = GHSync.getCfg();
    $("#setGroom").value = meta.groom || "";
    $("#setBride").value = meta.bride || "";
    $("#setDate").value = (meta.date || "").slice(0, 16);
    $("#setVenue").value = meta.venue || "";
    $("#setRepo").value = c.repoUrl || (c.owner && c.repo ? `https://github.com/${c.owner}/${c.repo}` : "");
    $("#setPath").value = c.path || "data/plan.json";
    $("#setToken").value = GHSync.getToken();
    setSyncState(GHSync.ready() ? "ok" : "idle");
    $("#settingsModal").classList.add("open");
  }
  const closeSettings = () => $("#settingsModal").classList.remove("open");
  async function saveSettings() {
    const firstConnect = appliedSha == null;
    meta = {
      ...meta,
      groom: $("#setGroom").value.trim() || meta.groom,
      bride: $("#setBride").value.trim() || meta.bride,
      date: $("#setDate").value || meta.date,
      venue: $("#setVenue").value.trim() || meta.venue,
    };
    const parsed = GHSync.parseRepo($("#setRepo").value);
    GHSync.setCfg({ owner: parsed && parsed.owner, repo: parsed && parsed.repo, path: $("#setPath").value.trim() || "data/plan.json", branch: "main", repoUrl: $("#setRepo").value.trim() });
    GHSync.setToken($("#setToken").value.trim());
    pushHistory();
    save();
    renderSummary();
    if (GHSync.ready() && firstConnect) { setSyncState("loading"); await remotePull(true); }
    else if (!GHSync.ready()) setSyncState("idle");
    closeSettings();
  }

  /* ---------------------- 분류 필터 칩 ---------------------- */
  function buildChips() {
    const wrap = $("#catChips");
    const chip = (id, label, icon, cls = "") =>
      `<button class="chip ${cls} ${catFilter === id ? "active" : ""}" data-cat="${id}">${icon ? icon + " " : ""}${attr(label)}</button>`;
    wrap.innerHTML =
      chip("all", "전체", "🗂️") +
      chip("starred", "즐겨찾기", "⭐") +
      cats.map((c) => chip(c.id, c.name, c.icon)).join("") +
      `<button class="chip add-cat" data-addcat="1" title="분류 추가">＋ 분류</button>`;
  }

  /* ---------------------- 분류 추가 / 이름변경 / 삭제 ---------------------- */
  function addCategory() {
    const name = (prompt("새 분류 이름을 입력하세요:") || "").trim();
    if (!name) return;
    pushHistory();
    const c = { id: newId(), name, icon: "🏷️" };
    cats.push(c);
    catFilter = c.id;
    render(); save();
  }
  function renameCategory(id) {
    const c = cats.find((x) => x.id === id); if (!c) return;
    const name = (prompt("분류 이름 수정:", c.name) || "").trim();
    if (!name || name === c.name) return;
    pushHistory(); c.name = name; render(); save();
  }
  function deleteCategory(id) {
    const c = cats.find((x) => x.id === id); if (!c) return;
    const used = rows.filter((r) => r.category === id).length;
    const msg = used ? `'${c.name}' 분류를 삭제하면 항목 ${used}개가 '미분류'로 이동합니다. 삭제할까요?`
      : `'${c.name}' 분류를 삭제할까요?`;
    if (!confirm(msg)) return;
    pushHistory();
    rows.forEach((r) => { if (r.category === id) r.category = "_none"; });
    cats = cats.filter((x) => x.id !== id);
    if (catFilter === id) catFilter = "all";
    render(); save();
  }

  /* ---------------------- 화면 전환 ---------------------- */
  function render() {
    buildChips();
    const isOv = view === "overview";
    $("#overview").hidden = !isOv;
    $("#tableView").hidden = isOv;
    $$("#viewToggle .chip").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (isOv) renderOverview(); else renderTable();
    renderSummary();
  }

  const inFilter = (r) => catFilter === "starred" ? !!r.star : (catFilter === "all" || r.category === catFilter);
  // 개요/필터에 쓸 분류 목록 (미분류 항목이 있으면 가상 분류 추가)
  function visibleCats() {
    const list = cats.slice();
    if (rows.some((r) => !cats.some((c) => c.id === r.category)))
      list.push({ id: "_none", name: "미분류", icon: "❓" });
    return list;
  }

  /* ---------------------- 개요(한눈에 보기) ---------------------- */
  function renderOverview() {
    const wrap = $("#overview");
    wrap.innerHTML = "";
    const starred = catFilter === "starred";
    const list = visibleCats().filter((c) => catFilter === "all" || starred || c.id === catFilter);
    list.forEach((c) => {
      let items = rows.map((r, i) => ({ r, i })).filter((x) =>
        x.r.category === c.id || (c.id === "_none" && !cats.some((cc) => cc.id === x.r.category)));
      if (starred) items = items.filter((x) => x.r.star);
      if (!items.length) return;
      const done = items.filter((x) => x.r.done).length;
      const pct = Math.round((done / items.length) * 100);
      const card = document.createElement("section");
      card.className = "ov-card";
      card.innerHTML = `
        <div class="ov-head">
          <span class="ov-icon">${c.icon}</span>
          <h3>${attr(c.name)}</h3>
          <span class="ov-count ${done === items.length ? "full" : ""}">${done}/${items.length}</span>
        </div>
        <div class="ov-bar"><div class="ov-fill" style="width:${pct}%"></div></div>
        <ul class="ov-list">${items.map((x) => ovItem(x.r, x.i)).join("")}</ul>
        ${c.id === "_none" ? "" : `<button class="ov-add" data-add="${c.id}">＋ 항목 추가</button>`}`;
      wrap.appendChild(card);
    });
    if (!wrap.children.length) wrap.innerHTML = `<p class="empty">해당 분류에 항목이 없습니다.</p>
      <button class="add-row" data-add>＋ 행 추가</button>`;
  }
  function ovItem(r, i) {
    const cls = STATUS_CLS[r.status] || "s-idea";
    const amt = r.done ? (r.price != null ? "완납 " + won(r.price) : "완납") : r.price != null ? won(r.price) : "";
    return `<li class="ov-item ${r.done ? "done" : ""}" data-i="${i}" title="클릭하면 완료 표시 전환">
      <span class="ov-check">${r.done ? "✓" : ""}</span>
      <span class="ov-name">${attr(r.item)}</span>
      <span class="ov-badge ${cls}">${r.status}</span>
      <span class="ov-amt">${amt}</span>
      <button class="ov-star ${r.star ? "on" : ""}" data-i="${i}" title="즐겨찾기">${r.star ? "★" : "☆"}</button>
    </li>`;
  }

  /* ---------------------- 상세 표 ---------------------- */
  function sortedRows() {
    let list = rows.map((r, i) => ({ r, i })).filter((x) => inFilter(x.r));
    if (!sort.key) return list;
    const k = sort.key;
    return list.sort((A, B) => {
      let va = k === "balance" ? balance(A.r) : A.r[k];
      let vb = k === "balance" ? balance(B.r) : B.r[k];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number") return (va - vb) * sort.dir;
      if (typeof va === "boolean") return (va === vb ? 0 : va ? -1 : 1) * sort.dir;
      return String(va).localeCompare(String(vb), "ko") * sort.dir;
    });
  }
  function renderTable() {
    const tb = $("#tbody");
    tb.innerHTML = "";
    const list = sortedRows();
    if (!list.length) { tb.innerHTML = `<tr><td colspan="11" class="empty">해당 분류에 항목이 없습니다.</td></tr>`; return; }
    list.forEach(({ r, i }) => tb.appendChild(rowEl(r, i)));
  }
  function catOptions(sel) {
    const known = cats.some((c) => c.id === sel);
    return cats.map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${attr(c.name)}</option>`).join("") +
      (known ? "" : `<option value="${attr(sel)}" selected>미분류</option>`);
  }
  function rowEl(r, i) {
    const tr = document.createElement("tr");
    if (r.done) tr.className = "done";
    tr.innerHTML = `
      <td class="c-lead"><span class="grip" title="드래그로 순서 변경">⠿</span><button class="star ${r.star ? "on" : ""}" data-i="${i}" title="즐겨찾기">${r.star ? "★" : "☆"}</button></td>
      <td class="c-done" data-label="완료"><input type="checkbox" data-i="${i}" data-f="done" ${r.done ? "checked" : ""}></td>
      <td class="c-type" data-label="구분"><button class="toggle ${r.type === "필수" ? "req" : "opt"}" data-i="${i}" title="필수↔선택 전환">${r.type}</button></td>
      <td class="c-cat" data-label="분류"><select data-i="${i}" data-f="category">${catOptions(r.category)}</select></td>
      <td data-label="항목"><input class="in-item" data-i="${i}" data-f="item" value="${attr(r.item)}" placeholder="항목명"></td>
      <td data-label="선택지/업체"><input class="in-opt" data-i="${i}" data-f="opt" value="${attr(r.opt)}" placeholder="선택지 / 업체"></td>
      <td class="num" data-label="금액(만원)"><input type="number" min="0" class="in-num" data-i="${i}" data-f="price" value="${r.price ?? ""}" placeholder="미정"></td>
      <td class="num" data-label="계약금(만원)"><input type="number" min="0" class="in-num" data-i="${i}" data-f="deposit" value="${r.deposit ?? ""}" placeholder="0"></td>
      <td class="c-status" data-label="상태"><select class="${STATUS_CLS[r.status] || "s-idea"}" data-i="${i}" data-f="status">${STATUSES.map((s) => `<option ${r.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td class="c-memo" data-label="비고"><input class="in-memo" data-i="${i}" data-f="memo" value="${attr(r.memo)}" placeholder="메모…"></td>
      <td class="c-del" data-label=""><button class="del" data-i="${i}" title="행 삭제">삭제</button></td>`;
    return tr;
  }

  /* ---------------------- 이벤트 ---------------------- */
  // 행 추가 (분류 지정 시 그 분류로, 표 화면으로 전환 후 항목명 포커스)
  function addRow(cat) {
    pushHistory();
    const active = catFilter !== "all" && catFilter !== "_none" && catFilter !== "starred" ? catFilter : null;
    const c = cat || active || (cats[0] && cats[0].id) || "admin";
    rows.push({ category: c, done: false, type: "선택", item: "", opt: "", price: null, deposit: 0, status: "검토중", memo: "", star: catFilter === "starred" });
    if (cat && cat !== catFilter) catFilter = cat;
    view = "table";
    sort.key = null;
    $$("#head .arrow").forEach((a) => (a.textContent = ""));
    render(); save();
    const inp = $("#tbody tr:last-child .in-item");
    if (inp) { inp.focus(); inp.scrollIntoView({ block: "center" }); }
  }

  function setDone(r, on) {
    // 완료 = 완납. 금액이 미정이면 실제 완납 금액을 받아 기록한다.
    if (on && r.price == null) {
      const v = prompt(`'${r.item}' 완납 금액(만원)을 입력하세요.\n(모르면 비워두고 확인)`, r.deposit || "");
      if (v != null && v.trim() !== "" && !isNaN(Number(v))) r.price = Number(v);
    }
    r.done = on;
    r.status = on ? "완료" : (r.status === "완료" ? "예정" : r.status);
  }

  function bind() {
    // 화면 전환
    $("#viewToggle").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      view = b.dataset.view; render();
    });
    // 분류 필터 / 추가 (더블클릭=이름변경, Alt·우클릭=삭제)
    $("#catChips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      if (b.dataset.addcat) { addCategory(); return; }
      const id = b.dataset.cat;
      if (e.altKey && id !== "all" && id !== "_none" && id !== "starred") { deleteCategory(id); return; }
      catFilter = id; render();
    });
    $("#catChips").addEventListener("dblclick", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      const id = b.dataset.cat;
      if (id && id !== "all" && id !== "_none" && id !== "starred" && !b.dataset.addcat) renameCategory(id);
    });
    $("#catChips").addEventListener("contextmenu", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      const id = b.dataset.cat;
      if (id && id !== "all" && id !== "_none" && id !== "starred" && !b.dataset.addcat) { e.preventDefault(); deleteCategory(id); }
    });
    // 행 추가 (표 위/아래 버튼, 개요 분류별 "+항목") — data-add 위임
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-add]");
      if (el) { addRow(el.getAttribute("data-add") || undefined); }
    });
    // 개요: 항목 클릭 → 완료 토글
    $("#overview").addEventListener("click", (e) => {
      if (e.target.closest("[data-add]")) return;
      const ovs = e.target.closest(".ov-star");
      if (ovs) { pushHistory(); const r = rows[ovs.dataset.i]; r.star = !r.star; render(); save(); return; }
      const li = e.target.closest(".ov-item"); if (!li) return;
      pushHistory();
      setDone(rows[li.dataset.i], !rows[li.dataset.i].done);
      render(); save();
    });

    const tb = $("#tbody");
    tb.addEventListener("focusin", (e) => { if (e.target.dataset && e.target.dataset.f) pending = snapshot(); });
    tb.addEventListener("input", (e) => {
      const el = e.target;
      if (!el.dataset.f) return;
      if (el.type === "checkbox" || el.tagName === "SELECT") return;
      if (pending != null) { pushHistory(pending); pending = null; }
      const r = rows[el.dataset.i], f = el.dataset.f;
      if (f === "price" || f === "deposit") {
        r[f] = el.value.trim() === "" ? (f === "deposit" ? 0 : null) : Number(el.value);
        const bc = el.closest("tr").querySelector(".bal");
        if (bc) bc.textContent = won(balance(r));
        localStorage.setItem(KEY, stateJson());
        renderSummary();
      } else {
        r[f] = el.value;
        localStorage.setItem(KEY, stateJson());
      }
      scheduleRemoteSave();
    });
    tb.addEventListener("change", (e) => {
      const el = e.target;
      if (!el.dataset.f) return;
      const r = rows[el.dataset.i], f = el.dataset.f;
      if (f === "done") { pushHistory(); setDone(r, el.checked); render(); }
      else if (f === "status") {
        if (pending != null) { pushHistory(pending); pending = null; } else pushHistory();
        r.status = el.value; r.done = el.value === "완료"; render();
      } else if (f === "category") {
        if (pending != null) { pushHistory(pending); pending = null; } else pushHistory();
        r.category = el.value; render();
      }
      save();
    });
    tb.addEventListener("click", (e) => {
      const st = e.target.closest(".star");
      if (st) { pushHistory(); const r = rows[st.dataset.i]; r.star = !r.star; render(); save(); return; }
      const tg = e.target.closest(".toggle");
      if (tg) { pushHistory(); const r = rows[tg.dataset.i]; r.type = r.type === "필수" ? "선택" : "필수"; render(); save(); return; }
      const del = e.target.closest(".del");
      if (del) { pushHistory(); rows.splice(Number(del.dataset.i), 1); render(); save(); return; }
    });

    // 드래그로 행 순서 변경 (SortableJS · 핸들 ⠿)
    if (typeof Sortable !== "undefined") {
      Sortable.create(tb, {
        handle: ".grip", animation: 160, ghostClass: "drag-ghost", chosenClass: "drag-chosen", dragClass: "drag-dragging",
        onEnd: (evt) => {
          const { oldIndex, newIndex } = evt;
          if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
          pushHistory();
          const vis = sortedRows().map((x) => x.r);
          const [m] = vis.splice(oldIndex, 1);
          vis.splice(newIndex, 0, m);
          const visSet = new Set(vis);
          let vi = 0;
          rows = rows.map((r) => (visSet.has(r) ? vis[vi++] : r));
          sort.key = null; $$("#head .arrow").forEach((a) => (a.textContent = ""));
          render(); save();
        },
      });
    }

    // 헤더 정렬
    $("#head").addEventListener("click", (e) => {
      const th = e.target.closest("th[data-key]"); if (!th) return;
      const key = th.dataset.key;
      sort.dir = sort.key === key ? -sort.dir : 1;
      sort.key = key;
      $$("#head .arrow").forEach((a) => (a.textContent = ""));
      th.querySelector(".arrow").textContent = sort.dir === 1 ? "▲" : "▼";
      renderTable();
    });

    // 되돌리기
    $("#undoBtn").addEventListener("click", undo);


    // 파일
    $("#saveFileBtn").addEventListener("click", connectSave);
    $("#openFileBtn").addEventListener("click", connectOpen);
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          if (!confirm("현재 내용을 이 파일로 덮어쓸까요? (되돌리기로 복구 가능)")) return;
          pushHistory(); applyImported(JSON.parse(rd.result)); afterFileLoad();
        } catch { alert("올바른 JSON이 아닙니다."); }
      };
      rd.readAsText(f); e.target.value = "";
    });
    $("#resetBtn").addEventListener("click", () => {
      if (confirm("기본값으로 초기화할까요? (되돌리기로 복구 가능)")) {
        pushHistory();
        cats = CATEGORIES.map((c) => ({ ...c }));
        rows = DEFAULT_ROWS.map((r) => ({ ...r }));
        catFilter = "all";
        render(); save();
      }
    });

    // 동기화 / 설정 (요소 없으면 무시 → 캐시 불일치에도 다른 바인딩이 죽지 않음)
    const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
    on("#syncBtn", "click", syncNow);
    on("#settingsBtn", "click", openSettings);
    on("#setCancel", "click", closeSettings);
    on("#setSave", "click", saveSettings);
    on("#setPull", "click", () => remotePull(true));
    on("#settingsModal", "click", (e) => { if (e.target.id === "settingsModal") closeSettings(); });

    if (!FS_OK) {
      const sf = $("#saveFileBtn"), of = $("#openFileBtn");
      if (sf) sf.textContent = "파일로 설정 추출 (다운로드)";
      if (of) of.textContent = "파일로부터 열기 (업로드)";
    }
  }

  const attr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  bind(); render();
  // 원격 동기화 초기화
  if (GHSync.ready()) { setSyncState("loading"); remotePull(true); } else setSyncState("idle");
  setInterval(() => { if (GHSync.ready() && !remoteBusy && !fromFilePending && saveTimer == null && document.visibilityState === "visible") remotePull(false); }, 25000);
  window.addEventListener("focus", () => { if (GHSync.ready() && !remoteBusy && !fromFilePending && saveTimer == null) remotePull(false); });
  setInterval(renderCountdown, 60000);
})();
