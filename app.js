(() => {
  "use strict";

  const STORAGE_KEY = "golf-score-rounds-v1";
  const DEFAULT_STROKES = 4;
  const DEFAULT_PAR = 4;
  const HOLE_COUNT = 18;
  const STROKE_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const PAR_CHOICES = [3, 4, 5];
  const MAX_STROKES = 99;

  /**
   * @typedef {"in_progress"|"complete"} RoundStatus
   * @typedef {{
   *   id: string,
   *   date: string,
   *   memo: string,
   *   scores: (number|null)[],
   *   pars: number[],
   *   status: RoundStatus,
   *   manualComplete: boolean,
   *   createdAt: string,
   *   updatedAt: string
   * }} Round
   */

  const els = {
    views: {
      home: document.getElementById("view-home"),
      edit: document.getElementById("view-edit"),
      detail: document.getElementById("view-detail"),
    },
    title: document.getElementById("topbar-title"),
    backBtn: document.getElementById("btn-back"),
    latestScore: document.getElementById("latest-score"),
    latestMeta: document.getElementById("latest-meta"),
    roundList: document.getElementById("round-list"),
    emptyState: document.getElementById("empty-state"),
    btnNew: document.getElementById("btn-new"),
    btnResume: document.getElementById("btn-resume"),
    resumeBlock: document.getElementById("resume-block"),
    resumeNote: document.getElementById("resume-note"),
    btnExportAll: document.getElementById("btn-export-all"),
    btnExportOne: document.getElementById("btn-export-one"),
    editDate: document.getElementById("edit-date"),
    editMemo: document.getElementById("edit-memo"),
    editStatus: document.getElementById("edit-status"),
    editProgressText: document.getElementById("edit-progress-text"),
    saveHint: document.getElementById("save-hint"),
    holeGrid: document.getElementById("hole-grid"),
    sumTotal: document.getElementById("sum-total"),
    sumOut: document.getElementById("sum-out"),
    sumIn: document.getElementById("sum-in"),
    sumPar: document.getElementById("sum-par"),
    sumDiff: document.getElementById("sum-diff"),
    btnSave: document.getElementById("btn-save"),
    btnComplete: document.getElementById("btn-complete"),
    btnReopen: document.getElementById("btn-reopen"),
    btnDeleteEdit: document.getElementById("btn-delete-edit"),
    detailDate: document.getElementById("detail-date"),
    detailStatus: document.getElementById("detail-status"),
    detailProgress: document.getElementById("detail-progress"),
    detailMemo: document.getElementById("detail-memo"),
    detailTotal: document.getElementById("detail-total"),
    detailOut: document.getElementById("detail-out"),
    detailIn: document.getElementById("detail-in"),
    detailPar: document.getElementById("detail-par"),
    detailDiff: document.getElementById("detail-diff"),
    detailHoles: document.getElementById("detail-holes"),
    btnEdit: document.getElementById("btn-edit"),
    btnDeleteDetail: document.getElementById("btn-delete-detail"),
    toast: document.getElementById("toast"),
    confirm: document.getElementById("confirm-overlay"),
    confirmTitle: document.getElementById("confirm-title"),
    confirmMessage: document.getElementById("confirm-message"),
    confirmOk: document.getElementById("confirm-ok"),
    confirmCancel: document.getElementById("confirm-cancel"),
  };

  /** @type {"home"|"edit"|"detail"} */
  let currentView = "home";
  /** @type {Round[]} */
  let rounds = [];
  /** @type {Round | null} */
  let editing = null;
  /** @type {string | null} */
  let detailId = null;
  /** @type {boolean[]} */
  let otherOpen = [];
  /** New round not yet written to storage. */
  let editingIsNew = false;
  /** Date captured when a new round was opened, for pristine detection. */
  let editingInitialDate = "";
  /** Hole index to highlight as the resume target, or -1. */
  let highlightHole = -1;
  let toastTimer = null;
  let confirmResolver = null;

  function uid() {
    return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatDateJP(iso) {
    if (!iso) return "日付なし";
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    const dt = new Date(y, m - 1, d);
    const week = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
    return `${y}年${m}月${d}日（${week}）`;
  }

  function clampScore(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return null;
    return Math.min(MAX_STROKES, Math.max(1, v));
  }

  function clampPar(n) {
    const v = Math.round(Number(n));
    if (PAR_CHOICES.includes(v)) return v;
    return DEFAULT_PAR;
  }

  function isEntered(score) {
    return score != null && Number.isFinite(Number(score));
  }

  function countEntered(scores, start = 0, end = HOLE_COUNT) {
    let n = 0;
    for (let i = start; i < end; i++) if (isEntered(scores[i])) n++;
    return n;
  }

  function sumEnteredScores(scores, start, end) {
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      if (!isEntered(scores[i])) continue;
      sum += scores[i];
      count++;
    }
    return { sum, count };
  }

  function sumEnteredPars(scores, pars, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) {
      if (!isEntered(scores[i])) continue;
      sum += pars[i];
    }
    return sum;
  }

  function statusLabel(status) {
    return status === "complete" ? "完了" : "プレー中";
  }

  function displayCount(value, count) {
    return count > 0 ? String(value) : "—";
  }

  /**
   * Legacy rounds stored 18 numeric scores and had no status.
   * Those stay complete. Null scores are the new unentered state.
   */
  function normalizeRound(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const rawScores = Array.isArray(r.scores) ? r.scores : null;
    const explicitStatus = r.status === "in_progress" || r.status === "complete";
    const looksLegacy =
      !explicitStatus &&
      Array.isArray(rawScores) &&
      rawScores.length > 0 &&
      rawScores.every((n) => n !== null && n !== "" && Number.isFinite(Number(n)));

    const scores = Array.from({ length: HOLE_COUNT }, (_, i) => {
      const fallback = looksLegacy ? DEFAULT_STROKES : null;
      if (!rawScores || i >= rawScores.length) return fallback;
      const cell = rawScores[i];
      if (cell === null || cell === undefined || cell === "") return fallback;
      const n = clampScore(cell);
      return n == null ? fallback : n;
    });

    const pars = Array.from({ length: HOLE_COUNT }, (_, i) => {
      if (!Array.isArray(r.pars) || i >= r.pars.length) return DEFAULT_PAR;
      const cell = r.pars[i];
      if (cell === null || cell === undefined || cell === "") return DEFAULT_PAR;
      return clampPar(cell);
    });

    const entered = countEntered(scores);
    let status;
    let manualComplete = false;
    if (entered === HOLE_COUNT) {
      status = "complete";
      manualComplete = false;
    } else if (r.status === "complete" || r.manualComplete === true) {
      status = "complete";
      manualComplete = true;
    } else if (looksLegacy) {
      status = "complete";
      manualComplete = false;
    } else {
      status = "in_progress";
      manualComplete = false;
    }

    return {
      id: String(r.id || uid()),
      date: String(r.date || ""),
      memo: String(r.memo || ""),
      scores,
      pars,
      status,
      manualComplete,
      createdAt: String(r.createdAt || new Date().toISOString()),
      updatedAt: String(r.updatedAt || r.createdAt || new Date().toISOString()),
    };
  }

  function compareRounds(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  }

  function loadRounds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeRound).sort(compareRounds);
    } catch {
      return [];
    }
  }

  function saveRounds() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
  }

  function snapshotRound(r) {
    return {
      id: r.id,
      date: r.date,
      memo: r.memo,
      scores: r.scores.slice(),
      pars: r.pars.slice(),
      status: r.status,
      manualComplete: !!r.manualComplete,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  function findInProgressRound() {
    const list = rounds.filter((r) => r.status === "in_progress");
    list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return list[0] || null;
  }

  function firstUnenteredIndex(scores) {
    return scores.findIndex((s) => !isEntered(s));
  }

  function formatDiff(diff) {
    if (diff === 0) return "±0";
    if (diff > 0) return `+${diff}`;
    return String(diff);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function askConfirm(title, message) {
    return new Promise((resolve) => {
      confirmResolver = resolve;
      els.confirmTitle.textContent = title;
      els.confirmMessage.textContent = message;
      els.confirm.classList.add("show");
    });
  }

  function closeConfirm(result) {
    els.confirm.classList.remove("show");
    if (confirmResolver) {
      const r = confirmResolver;
      confirmResolver = null;
      r(result);
    }
  }

  function setView(name, title) {
    currentView = name;
    Object.entries(els.views).forEach(([key, el]) => {
      el.classList.toggle("active", key === name);
    });
    els.title.textContent = title;
    els.backBtn.hidden = name === "home";
    window.scrollTo(0, 0);
  }

  function blankRound() {
    const now = new Date().toISOString();
    return {
      id: uid(),
      date: todayISO(),
      memo: "",
      scores: Array.from({ length: HOLE_COUNT }, () => null),
      pars: Array.from({ length: HOLE_COUNT }, () => DEFAULT_PAR),
      status: "in_progress",
      manualComplete: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function roundFigures(r) {
    const total = sumEnteredScores(r.scores, 0, HOLE_COUNT);
    const out = sumEnteredScores(r.scores, 0, 9);
    const inn = sumEnteredScores(r.scores, 9, 18);
    const parTotal = sumEnteredPars(r.scores, r.pars, 0, HOLE_COUNT);
    const outPar = sumEnteredPars(r.scores, r.pars, 0, 9);
    const inPar = sumEnteredPars(r.scores, r.pars, 9, 18);
    return { total, out, inn, parTotal, outPar, inPar };
  }

  function renderHome() {
    setView("home", "ゴルフスコア帳");
    const progress = findInProgressRound();
    if (els.resumeBlock) {
      if (progress) {
        const n = countEntered(progress.scores);
        const hole = firstUnenteredIndex(progress.scores);
        const holeLabel = hole >= 0 ? `${hole + 1}番ホールから` : "続きから";
        els.resumeBlock.hidden = false;
        els.resumeNote.textContent = `${formatDateJP(progress.date)} · ${n}/18ホール · ${holeLabel}`;
        els.btnResume.setAttribute(
          "aria-label",
          `${formatDateJP(progress.date)}のプレー中ラウンドを${holeLabel}入力する`
        );
      } else {
        els.resumeBlock.hidden = true;
      }
    }
    if (els.btnNew) {
      els.btnNew.classList.toggle("btn-primary", !progress);
      els.btnNew.classList.toggle("btn-secondary", !!progress);
    }

    if (!rounds.length) {
      els.latestScore.textContent = "—";
      els.latestMeta.textContent = "まだラウンドがありません";
      els.emptyState.hidden = false;
      els.roundList.innerHTML = "";
      if (els.btnExportAll) els.btnExportAll.hidden = true;
      return;
    }

    els.emptyState.hidden = true;
    if (els.btnExportAll) els.btnExportAll.hidden = false;
    const latest = rounds[0];
    const figs = roundFigures(latest);
    els.latestScore.textContent = displayCount(figs.total.sum, figs.total.count);
    const diffText = figs.total.count ? formatDiff(figs.total.sum - figs.parTotal) : "—";
    els.latestMeta.textContent = `${formatDateJP(latest.date)}\n${statusLabel(latest.status)} · ${figs.total.count}/18 · ${diffText} · ${rounds.length}ラウンド`;

    els.roundList.innerHTML = "";
    rounds.forEach((r) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "round-item";
      btn.dataset.status = r.status;
      const memo = (r.memo || "").trim();
      const figsR = roundFigures(r);
      const n = figsR.total.count;
      const diff = n ? formatDiff(figsR.total.sum - figsR.parTotal) : "—";
      const outText = displayCount(figsR.out.sum, figsR.out.count);
      const inText = displayCount(figsR.inn.sum, figsR.inn.count);
      const badgeClass = r.status === "complete" ? "is-complete" : "is-progress";
      btn.setAttribute(
        "aria-label",
        `${formatDateJP(r.date)} ${statusLabel(r.status)} のラウンドを開く`
      );
      btn.innerHTML = `
        <div class="round-item-main">
          <div class="round-item-date">
            <span>${escapeHtml(formatDateJP(r.date))}</span>
            <span class="status-badge ${badgeClass}">${statusLabel(r.status)}</span>
          </div>
          <div class="round-item-meta">${escapeHtml(memo || "メモなし")} · ${n}/18 · OUT ${outText} / IN ${inText} · ${diff}</div>
        </div>
        <div class="round-item-score">${n ? figsR.total.sum : "—"}</div>
      `;
      btn.addEventListener("click", () => openDetail(r.id));
      li.appendChild(btn);
      els.roundList.appendChild(li);
    });
  }

  function updateEditSummary() {
    if (!editing) return;
    const figs = roundFigures(editing);
    els.sumTotal.textContent = displayCount(figs.total.sum, figs.total.count);
    els.sumOut.textContent = displayCount(figs.out.sum, figs.out.count);
    els.sumIn.textContent = displayCount(figs.inn.sum, figs.inn.count);
    if (els.sumPar) els.sumPar.textContent = displayCount(figs.parTotal, figs.total.count);
    if (els.sumDiff) {
      els.sumDiff.textContent = figs.total.count
        ? formatDiff(figs.total.sum - figs.parTotal)
        : "—";
    }
  }

  function updateEditChrome() {
    if (!editing) return;
    const n = countEntered(editing.scores);
    const complete = editing.status === "complete";
    if (els.editStatus) {
      els.editStatus.textContent = statusLabel(editing.status);
      els.editStatus.className = `status-badge ${complete ? "is-complete" : "is-progress"}`;
    }
    if (els.editProgressText) {
      els.editProgressText.textContent = `${n}/${HOLE_COUNT}ホールを集計`;
    }
    if (els.btnComplete) els.btnComplete.hidden = complete;
    if (els.btnReopen) els.btnReopen.hidden = !(complete && n < HOLE_COUNT);
  }

  function isPresetStroke(n) {
    return STROKE_CHOICES.includes(n);
  }

  function renderHoleGrid() {
    els.holeGrid.innerHTML = "";
    if (!editing) return;
    if (otherOpen.length !== HOLE_COUNT) {
      otherOpen = editing.scores.map((s) => isEntered(s) && !isPresetStroke(s));
    }

    for (let i = 0; i < HOLE_COUNT; i++) {
      const side = i < 9 ? "OUT" : "IN";
      const score = isEntered(editing.scores[i]) ? editing.scores[i] : null;
      const par = editing.pars[i];
      const entered = score != null;
      const useOther = otherOpen[i] || (entered && !isPresetStroke(score));
      otherOpen[i] = useOther;
      const isNext = i === highlightHole;

      const card = document.createElement("article");
      card.className = `hole-card${entered ? "" : " is-empty"}${isNext ? " is-next" : ""}`;
      card.dataset.hole = String(i);
      card.id = `hole-card-${i}`;
      if (isNext) card.tabIndex = -1;

      const parBtns = PAR_CHOICES.map(
        (p) =>
          `<button type="button" class="chip chip-par${p === par ? " selected" : ""}" data-par="${p}" aria-pressed="${p === par}">PAR${p}</button>`
      ).join("");

      const strokeBtns = STROKE_CHOICES.map((s) => {
        const selected = entered && !useOther && s === score;
        return `<button type="button" class="chip chip-stroke${selected ? " selected" : ""}" data-stroke="${s}" aria-pressed="${selected}">${s}</button>`;
      }).join("");

      const scoreHtml = entered
        ? `<span class="hole-result-score">${score}</span><span class="hole-result-meta">PAR${par} · ${formatDiff(score - par)}</span>`
        : `<span class="hole-result-score is-empty">未入力</span><span class="hole-result-meta">PAR${par} · 打数を選択</span>`;

      const nextTag = isNext ? `<span class="hole-next-tag">続きはここから</span>` : "";

      card.innerHTML = `
        <div class="hole-card-head">
          <div class="hole-label">
            ${i + 1}H
            <small>${side}${nextTag}</small>
          </div>
          <div class="hole-result" aria-live="polite">${scoreHtml}</div>
        </div>
        <div class="hole-section">
          <div class="hole-section-label">PAR</div>
          <div class="chip-row chip-row-par" role="group" aria-label="${i + 1}番ホールのPAR">${parBtns}</div>
        </div>
        <div class="hole-section">
          <div class="hole-section-label">打数</div>
          <div class="chip-row chip-row-strokes" role="group" aria-label="${i + 1}番ホールの打数">${strokeBtns}
            <button type="button" class="chip chip-other${useOther ? " selected" : ""}" data-other="1" aria-pressed="${useOther}">その他</button>
          </div>
          <div class="other-wrap${useOther ? "" : " hidden"}">
            <label class="other-label" for="other-${i}">打数を入力</label>
            <input
              id="other-${i}"
              class="other-input"
              type="number"
              inputmode="numeric"
              min="1"
              max="${MAX_STROKES}"
              placeholder="11〜99"
              value="${entered ? score : ""}"
              aria-label="${i + 1}番ホールの打数（自由入力）"
            />
          </div>
        </div>
      `;

      card.querySelectorAll("[data-par]").forEach((btn) => {
        btn.addEventListener("click", () => {
          editing.pars[i] = clampPar(Number(btn.getAttribute("data-par")));
          const result = commitEditing();
          refreshHoleCard(i);
          if (result.becameComplete) showToast("18ホール入力済みのため完了にしました");
        });
      });

      card.querySelectorAll("[data-stroke]").forEach((btn) => {
        btn.addEventListener("click", () => {
          otherOpen[i] = false;
          editing.scores[i] = clampScore(Number(btn.getAttribute("data-stroke")));
          const result = commitEditing();
          refreshHoleCard(i);
          if (result.becameComplete) showToast("18ホール入力済みのため完了にしました");
        });
      });

      card.querySelector("[data-other]").addEventListener("click", () => {
        otherOpen[i] = true;
        refreshHoleCard(i);
        const input = document.getElementById(`other-${i}`);
        if (input) {
          input.focus();
          input.select();
        }
      });

      const otherInput = card.querySelector(".other-input");
      const applyOther = (raw, { refresh }) => {
        if (raw.trim() === "") {
          editing.scores[i] = null;
        } else {
          const n = clampScore(raw);
          if (n == null) return;
          editing.scores[i] = n;
        }
        otherOpen[i] = true;
        const result = commitEditing();
        if (refresh) {
          refreshHoleCard(i);
        } else {
          paintHoleResult(card, i);
        }
        if (result.becameComplete) showToast("18ホール入力済みのため完了にしました");
      };
      otherInput.addEventListener("input", () => {
        applyOther(otherInput.value, { refresh: false });
      });
      otherInput.addEventListener("change", () => {
        applyOther(otherInput.value, { refresh: true });
      });

      els.holeGrid.appendChild(card);
    }
  }

  function paintHoleResult(card, i) {
    const score = isEntered(editing.scores[i]) ? editing.scores[i] : null;
    const par = editing.pars[i];
    const scoreEl = card.querySelector(".hole-result-score");
    const metaEl = card.querySelector(".hole-result-meta");
    if (!scoreEl || !metaEl) return;
    if (score == null) {
      scoreEl.textContent = "未入力";
      scoreEl.classList.add("is-empty");
      metaEl.textContent = `PAR${par} · 打数を選択`;
      card.classList.add("is-empty");
    } else {
      scoreEl.textContent = String(score);
      scoreEl.classList.remove("is-empty");
      metaEl.textContent = `PAR${par} · ${formatDiff(score - par)}`;
      card.classList.remove("is-empty");
    }
  }

  function refreshHoleCard() {
    const scrollY = window.scrollY;
    const activeId = document.activeElement && document.activeElement.id;
    renderHoleGrid();
    window.scrollTo(0, scrollY);
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) el.focus();
    }
  }

  function syncEditingFromForm() {
    if (!editing) return;
    if (els.editDate) editing.date = els.editDate.value || editing.date || todayISO();
    if (els.editMemo) editing.memo = els.editMemo.value;
    for (let i = 0; i < HOLE_COUNT; i++) {
      if (!otherOpen[i]) continue;
      const input = document.getElementById(`other-${i}`);
      if (!input) continue;
      const raw = input.value.trim();
      if (raw === "") editing.scores[i] = null;
      else {
        const n = clampScore(raw);
        if (n != null) editing.scores[i] = n;
      }
    }
    for (let i = 0; i < HOLE_COUNT; i++) {
      if (isEntered(editing.scores[i])) editing.scores[i] = clampScore(editing.scores[i]);
      else editing.scores[i] = null;
      editing.pars[i] = clampPar(editing.pars[i]);
    }
  }

  function isPristineNew() {
    if (!editing || !editingIsNew) return false;
    if ((editing.memo || "").trim()) return false;
    if (editing.scores.some((s) => isEntered(s))) return false;
    if (editing.pars.some((p) => p !== DEFAULT_PAR)) return false;
    if ((editing.date || "") !== editingInitialDate) return false;
    if (editing.manualComplete) return false;
    return true;
  }

  /**
   * @returns {{ becameComplete: boolean, saved: boolean }}
   */
  function reconcileStatus(round, manual) {
    const was = round.status;
    const n = countEntered(round.scores);
    if (manual === true) {
      round.status = "complete";
      round.manualComplete = true;
    } else if (manual === false) {
      round.manualComplete = false;
      round.status = n === HOLE_COUNT ? "complete" : "in_progress";
    } else if (n === HOLE_COUNT) {
      round.status = "complete";
      round.manualComplete = false;
    } else if (round.manualComplete) {
      round.status = "complete";
    } else {
      round.status = "in_progress";
    }
    return { becameComplete: was !== "complete" && round.status === "complete" };
  }

  function writeEditingToStore() {
    editing.updatedAt = new Date().toISOString();
    const snap = snapshotRound(editing);
    const idx = rounds.findIndex((r) => r.id === editing.id);
    if (idx >= 0) rounds[idx] = snap;
    else rounds.unshift(snap);
    rounds.sort(compareRounds);
    saveRounds();
    editingIsNew = false;
    if (els.btnDeleteEdit) els.btnDeleteEdit.hidden = false;
    if (els.saveHint) els.saveHint.textContent = "自動保存しました";
  }

  function commitEditing({ force = false, manual } = {}) {
    if (!editing) return { becameComplete: false, saved: false };
    syncEditingFromForm();
    const statusResult = reconcileStatus(editing, manual);
    updateEditSummary();
    updateEditChrome();
    if (!force && isPristineNew()) return { becameComplete: false, saved: false };
    writeEditingToStore();
    return { becameComplete: statusResult.becameComplete, saved: true };
  }

  function focusHoleCard(index) {
    const card = document.getElementById(`hole-card-${index}`);
    if (!card) return;
    card.tabIndex = -1;
    const headerOffset = 76;
    const top = card.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo(0, Math.max(0, top));
    card.focus({ preventScroll: true });
  }

  function openNew() {
    editing = blankRound();
    editingIsNew = true;
    editingInitialDate = editing.date;
    otherOpen = Array.from({ length: HOLE_COUNT }, () => false);
    highlightHole = -1;
    detailId = null;
    els.editDate.value = editing.date;
    els.editMemo.value = "";
    els.btnDeleteEdit.hidden = true;
    if (els.saveHint) els.saveHint.textContent = "入力は自動で保存されます";
    setView("edit", "新しいラウンド");
    renderHoleGrid();
    updateEditSummary();
    updateEditChrome();
  }

  function openEdit(id, opts = {}) {
    const found = rounds.find((r) => r.id === id);
    if (!found) {
      showToast("ラウンドが見つかりません");
      renderHome();
      return;
    }
    editing = snapshotRound(found);
    editingIsNew = false;
    editingInitialDate = editing.date;
    otherOpen = editing.scores.map((s) => isEntered(s) && !isPresetStroke(s));
    highlightHole = -1;
    if (opts.focusFirstEmpty) {
      highlightHole = firstUnenteredIndex(editing.scores);
    }
    els.editDate.value = editing.date || "";
    els.editMemo.value = editing.memo || "";
    els.btnDeleteEdit.hidden = false;
    if (els.saveHint) els.saveHint.textContent = "入力は自動で保存されます";
    setView("edit", opts.title || "ラウンドを編集");
    renderHoleGrid();
    updateEditSummary();
    updateEditChrome();
    if (highlightHole >= 0) focusHoleCard(highlightHole);
  }

  function openResume() {
    const round = findInProgressRound();
    if (!round) {
      showToast("プレー中のラウンドはありません");
      renderHome();
      return;
    }
    detailId = null;
    openEdit(round.id, { focusFirstEmpty: true, title: "続きから入力" });
  }

  function openDetail(id) {
    const found = rounds.find((r) => r.id === id);
    if (!found) {
      showToast("ラウンドが見つかりません");
      renderHome();
      return;
    }
    detailId = id;
    const figs = roundFigures(found);
    const n = figs.total.count;
    els.detailDate.textContent = formatDateJP(found.date);
    if (els.detailStatus) {
      els.detailStatus.textContent = statusLabel(found.status);
      els.detailStatus.className = `status-badge ${found.status === "complete" ? "is-complete" : "is-progress"}`;
    }
    if (els.detailProgress) {
      els.detailProgress.textContent = `入力 ${n}/${HOLE_COUNT}ホール`;
    }
    const memo = (found.memo || "").trim();
    els.detailMemo.textContent = memo || "メモなし";
    els.detailMemo.style.opacity = memo ? "1" : "0.7";
    els.detailTotal.textContent = displayCount(figs.total.sum, n);
    els.detailOut.textContent = displayCount(figs.out.sum, figs.out.count);
    els.detailIn.textContent = displayCount(figs.inn.sum, figs.inn.count);
    if (els.detailPar) els.detailPar.textContent = displayCount(figs.parTotal, n);
    if (els.detailDiff) {
      els.detailDiff.textContent = n ? formatDiff(figs.total.sum - figs.parTotal) : "—";
    }

    els.detailHoles.innerHTML = "";
    found.scores.forEach((s, i) => {
      const cell = document.createElement("div");
      const entered = isEntered(s);
      cell.className = `detail-hole${entered ? "" : " is-empty"}`;
      if (entered) {
        const p = found.pars[i];
        cell.innerHTML = `
          <div class="n">${i + 1}H · PAR${p}</div>
          <div class="s">${s}</div>
          <div class="d">${formatDiff(s - p)}</div>
        `;
      } else {
        cell.innerHTML = `
          <div class="n">${i + 1}H</div>
          <div class="s">—</div>
          <div class="d">未入力</div>
        `;
      }
      els.detailHoles.appendChild(cell);
    });

    setView("detail", "ラウンド詳細");
  }

  function escapeMdCell(s) {
    return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  }

  function filenameDate(iso) {
    return (iso || todayISO()).replace(/-/g, "");
  }

  function mdSideLine(label, rangeLabel, scores, pars, start, end) {
    const stat = sumEnteredScores(scores, start, end);
    const holes = end - start;
    if (!stat.count) return `- ${label} (${rangeLabel}): -（未入力）`;
    const par = sumEnteredPars(scores, pars, start, end);
    return `- ${label} (${rangeLabel}): ${stat.sum}（PAR ${par} / ${formatDiff(stat.sum - par)}、入力 ${stat.count}/${holes}）`;
  }

  function mdAggregate(scores, pars, start, end) {
    const stat = sumEnteredScores(scores, start, end);
    if (!stat.count) return { score: "-", par: "-", diff: "-" };
    const par = sumEnteredPars(scores, pars, start, end);
    return {
      score: String(stat.sum),
      par: String(par),
      diff: formatDiff(stat.sum - par),
    };
  }

  function roundToMarkdown(r, { headingLevel = 2 } = {}) {
    const h = "#".repeat(headingLevel);
    const entered = countEntered(r.scores);
    const total = mdAggregate(r.scores, r.pars, 0, HOLE_COUNT);
    const out = mdAggregate(r.scores, r.pars, 0, 9);
    const inn = mdAggregate(r.scores, r.pars, 9, 18);
    const memo = (r.memo || "").trim() || "（なし）";
    const lines = [];
    lines.push(`${h} ラウンド ${formatDateJP(r.date)}`);
    lines.push("");
    lines.push(`- 日付: ${r.date || "（未設定）"}`);
    lines.push(`- 状態: ${statusLabel(r.status)}`);
    lines.push(`- 入力ホール: **${entered}/${HOLE_COUNT}**`);
    lines.push(`- メモ: ${memo}`);
    lines.push(`- 合計打数: **${total.score}**`);
    lines.push(`- PAR計: **${total.par}**（入力済みホールのPARのみ）`);
    lines.push(`- 差: **${total.diff}**`);
    lines.push(mdSideLine("OUT", "1–9", r.scores, r.pars, 0, 9));
    lines.push(mdSideLine("IN", "10–18", r.scores, r.pars, 9, 18));
    lines.push(`- 記録ID: \`${r.id}\``);
    lines.push("");
    lines.push(
      `未入力ホールは「-」です。合計・PAR計・差・OUT・IN は入力済み ${entered} ホールだけを集計しています。`
    );
    lines.push("");
    lines.push("### ホール別スコア");
    lines.push("");
    lines.push("| ホール | サイド | PAR | 打数 | 差 |");
    lines.push("| ---: | :--- | ---: | ---: | ---: |");
    for (let i = 0; i < HOLE_COUNT; i++) {
      const side = i < 9 ? "OUT" : "IN";
      if (!isEntered(r.scores[i])) {
        lines.push(`| ${i + 1} | ${side} | - | - | - |`);
      } else {
        const par = r.pars[i];
        const score = r.scores[i];
        lines.push(`| ${i + 1} | ${side} | ${par} | ${score} | ${formatDiff(score - par)} |`);
      }
    }
    lines.push("");
    lines.push("| 集計 | 打数 | PAR | 差 |");
    lines.push("| :--- | ---: | ---: | ---: |");
    lines.push(`| OUT | ${out.score} | ${out.par} | ${out.diff} |`);
    lines.push(`| IN | ${inn.score} | ${inn.par} | ${inn.diff} |`);
    lines.push(`| 合計 | ${total.score} | ${total.par} | ${total.diff} |`);
    lines.push("");
    return lines.join("\n");
  }

  function allRoundsToMarkdown(list) {
    const sorted = list.slice().sort(compareRounds);
    const lines = [];
    lines.push("# ゴルフスコア記録（全履歴）");
    lines.push("");
    lines.push(`- 書き出し日: ${formatDateJP(todayISO())}`);
    lines.push(`- ラウンド数: ${sorted.length}`);
    lines.push("- 集計は各ラウンドの入力済みホールのみです。未入力ホールは「-」です。");
    lines.push("");
    lines.push("## 一覧");
    lines.push("");
    lines.push("| # | 日付 | 状態 | 入力 | 合計 | PAR計 | 差 | OUT | IN | メモ |");
    lines.push("| ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |");
    sorted.forEach((r, idx) => {
      const total = mdAggregate(r.scores, r.pars, 0, HOLE_COUNT);
      const out = mdAggregate(r.scores, r.pars, 0, 9);
      const inn = mdAggregate(r.scores, r.pars, 9, 18);
      const memo = escapeMdCell((r.memo || "").trim() || "—");
      lines.push(
        `| ${idx + 1} | ${r.date || "—"} | ${statusLabel(r.status)} | ${countEntered(r.scores)}/${HOLE_COUNT} | ${total.score} | ${total.par} | ${total.diff} | ${out.score} | ${inn.score} | ${memo} |`
      );
    });
    lines.push("");
    lines.push("---");
    lines.push("");
    sorted.forEach((r, idx) => {
      lines.push(roundToMarkdown(r, { headingLevel: 2 }));
      if (idx < sorted.length - 1) {
        lines.push("---");
        lines.push("");
      }
    });
    lines.push("");
    lines.push("> この Markdown はゴルフスコア帳アプリから書き出したスコア記録です。他のAIに渡して分析・要約・比較できます。");
    lines.push("");
    return lines.join("\n");
  }

  function downloadTextFile(filename, content, mime = "text/markdown;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportOneRound(id) {
    const found = rounds.find((r) => r.id === id);
    if (!found) {
      showToast("ラウンドが見つかりません");
      return;
    }
    const md = [
      "# ゴルフスコア記録（1ラウンド）",
      "",
      `- 書き出し日: ${formatDateJP(todayISO())}`,
      "",
      roundToMarkdown(found, { headingLevel: 2 }),
      "> この Markdown はゴルフスコア帳アプリから書き出したスコア記録です。他のAIに渡して分析・要約できます。",
      "",
    ].join("\n");
    downloadTextFile(`golf-score-${filenameDate(found.date)}.md`, md);
    showToast("Markdown をダウンロードしました");
  }

  function exportAllRounds() {
    if (!rounds.length) {
      showToast("書き出すラウンドがありません");
      return;
    }
    const md = allRoundsToMarkdown(rounds);
    downloadTextFile(`golf-score-all-${filenameDate(todayISO())}.md`, md);
    showToast("全履歴の Markdown をダウンロードしました");
  }

  function saveEditing() {
    if (!editing) return;
    commitEditing({ force: true });
    const savedId = editing.id;
    editing = null;
    highlightHole = -1;
    showToast("ラウンドを保存しました");
    openDetail(savedId);
  }

  function markComplete() {
    if (!editing) return;
    const result = commitEditing({ force: true, manual: true });
    if (result.saved) showToast("ラウンドを完了にしました");
  }

  function reopenRound() {
    if (!editing) return;
    commitEditing({ force: true, manual: false });
    showToast("プレー中に戻しました");
  }

  async function deleteById(id) {
    const ok = await askConfirm(
      "ラウンドを削除しますか？",
      "この操作は取り消せません。端末に保存されたデータから削除されます。"
    );
    if (!ok) return;
    rounds = rounds.filter((r) => r.id !== id);
    saveRounds();
    editing = null;
    editingIsNew = false;
    detailId = null;
    highlightHole = -1;
    showToast("削除しました");
    renderHome();
  }

  function goBack() {
    if (currentView === "edit") {
      commitEditing();
      const id = editing ? editing.id : null;
      const returnToDetail = detailId && detailId === id && rounds.some((r) => r.id === id);
      editing = null;
      highlightHole = -1;
      if (returnToDetail) {
        openDetail(id);
      } else {
        detailId = null;
        renderHome();
      }
      return;
    }
    if (currentView === "detail") {
      detailId = null;
      renderHome();
    }
  }

  els.btnNew.addEventListener("click", openNew);
  if (els.btnResume) els.btnResume.addEventListener("click", openResume);
  els.backBtn.addEventListener("click", goBack);
  els.btnSave.addEventListener("click", saveEditing);
  if (els.btnComplete) els.btnComplete.addEventListener("click", markComplete);
  if (els.btnReopen) els.btnReopen.addEventListener("click", reopenRound);
  if (els.btnExportAll) els.btnExportAll.addEventListener("click", exportAllRounds);
  if (els.btnExportOne) {
    els.btnExportOne.addEventListener("click", () => {
      if (detailId) exportOneRound(detailId);
    });
  }
  els.btnEdit.addEventListener("click", () => {
    if (detailId) openEdit(detailId);
  });
  els.btnDeleteEdit.addEventListener("click", () => {
    if (editing && rounds.some((r) => r.id === editing.id)) deleteById(editing.id);
  });
  els.btnDeleteDetail.addEventListener("click", () => {
    if (detailId) deleteById(detailId);
  });
  els.confirmCancel.addEventListener("click", () => closeConfirm(false));
  els.confirmOk.addEventListener("click", () => closeConfirm(true));
  els.confirm.addEventListener("click", (e) => {
    if (e.target === els.confirm) closeConfirm(false);
  });

  if (els.editDate) {
    els.editDate.addEventListener("change", () => {
      if (!editing) return;
      editing.date = els.editDate.value || todayISO();
      if (!els.editDate.value) els.editDate.value = editing.date;
      commitEditing();
    });
  }
  if (els.editMemo) {
    els.editMemo.addEventListener("input", () => {
      if (!editing) return;
      editing.memo = els.editMemo.value;
      commitEditing();
    });
  }

  window.addEventListener("pagehide", () => {
    if (currentView === "edit") commitEditing();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && currentView === "edit") commitEditing();
  });

  rounds = loadRounds();
  renderHome();
})();
