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
   *   courseName: string,
   *   courseSource: ""|"golfcore"|"name-only",
   *   courseSlug: string,
   *   courseUrl: string,
   *   courseAreas: string[],
   *   courseTee: string,
   *   distances: (number|null)[],
   *   courseHoles: boolean[],
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
    tabManual: document.getElementById("tab-manual"),
    tabCourse: document.getElementById("tab-course"),
    courseBanner: document.getElementById("course-name-banner"),
    coursePanel: document.getElementById("course-panel"),
    courseQuery: document.getElementById("course-query"),
    courseStatus: document.getElementById("course-status"),
    courseResults: document.getElementById("course-results"),
    coursePicker: document.getElementById("course-picker"),
    courseChosen: document.getElementById("course-chosen"),
    holeSectionTitle: document.getElementById("hole-section-title"),
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
    detailCourse: document.getElementById("detail-course"),
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
  let courseSearchSeq = 0;
  let courseSearchTimer = null;
  /** @type {ReturnType<typeof GolfCourses.classifyCourse> | null} */
  let pendingCourse = null;
  /** @type {string[]} */
  let areaPick = [];

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

    const distances = Array.from({ length: HOLE_COUNT }, (_, i) => {
      if (!Array.isArray(r.distances)) return null;
      const n = Number(r.distances[i]);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    });
    const courseHoles = Array.from({ length: HOLE_COUNT }, (_, i) => {
      return Array.isArray(r.courseHoles) ? r.courseHoles[i] === true : false;
    });
    const source = r.courseSource === "golfcore" || r.courseSource === "name-only" ? r.courseSource : "";

    return {
      id: String(r.id || uid()),
      date: String(r.date || ""),
      memo: String(r.memo || ""),
      scores,
      pars,
      status,
      manualComplete,
      courseName: String(r.courseName || ""),
      courseSource: source,
      courseSlug: String(r.courseSlug || ""),
      courseUrl: String(r.courseUrl || ""),
      courseAreas: Array.isArray(r.courseAreas) ? r.courseAreas.map((name) => String(name)).slice(0, 2) : [],
      courseTee: String(r.courseTee || ""),
      distances,
      courseHoles,
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
      courseName: r.courseName || "",
      courseSource: r.courseSource || "",
      courseSlug: r.courseSlug || "",
      courseUrl: r.courseUrl || "",
      courseAreas: (r.courseAreas || []).slice(),
      courseTee: r.courseTee || "",
      distances: (r.distances || Array.from({ length: HOLE_COUNT }, () => null)).slice(),
      courseHoles: (r.courseHoles || Array.from({ length: HOLE_COUNT }, () => false)).slice(),
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
      courseName: "",
      courseSource: "",
      courseSlug: "",
      courseUrl: "",
      courseAreas: [],
      courseTee: "",
      distances: Array.from({ length: HOLE_COUNT }, () => null),
      courseHoles: Array.from({ length: HOLE_COUNT }, () => false),
      createdAt: now,
      updatedAt: now,
    };
  }

  function emptyCourseFields() {
    return {
      courseName: "",
      courseSource: "",
      courseSlug: "",
      courseUrl: "",
      courseAreas: [],
      courseTee: "",
      distances: Array.from({ length: HOLE_COUNT }, () => null),
      courseHoles: Array.from({ length: HOLE_COUNT }, () => false),
    };
  }

  function yardText(yards) {
    return yards != null ? `${yards} yd` : "";
  }

  function holeMetaText(par, score, yards) {
    const yard = yardText(yards);
    if (score == null) {
      return yard ? `PAR${par} · ${yard}` : `PAR${par} · 打数を選択`;
    }
    const diff = formatDiff(score - par);
    return yard ? `PAR${par} · ${yard} · ${diff}` : `PAR${par} · ${diff}`;
  }

  function courseSummary(round) {
    if (!round || !round.courseName) return "";
    const bits = [round.courseName];
    if (round.courseAreas && round.courseAreas.length) bits.push(round.courseAreas.join(" / "));
    if (round.courseTee) bits.push(round.courseTee);
    if (round.courseSource === "name-only") bits.push("ホールデータなし");
    return bits.join(" · ");
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
          <div class="round-item-meta">${escapeHtml([r.courseName, memo].filter(Boolean).join(" · ") || "メモなし")} · ${n}/18 · OUT ${outText} / IN ${inText} · ${diff}</div>
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

      const yards = editing.distances[i];
      const scoreHtml = entered
        ? `<span class="hole-result-score">${score}</span><span class="hole-result-meta">${holeMetaText(par, score, yards)}</span>`
        : `<span class="hole-result-score is-empty">未入力</span><span class="hole-result-meta">${holeMetaText(par, null, yards)}</span>`;

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
    const yards = editing.distances[i];
    if (score == null) {
      scoreEl.textContent = "未入力";
      scoreEl.classList.add("is-empty");
      metaEl.textContent = holeMetaText(par, null, yards);
      card.classList.add("is-empty");
    } else {
      scoreEl.textContent = String(score);
      scoreEl.classList.remove("is-empty");
      metaEl.textContent = holeMetaText(par, score, yards);
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
    if ((editing.courseName || "").trim()) return false;
    if (editing.courseSource) return false;
    if ((editing.courseHoles || []).some(Boolean)) return false;
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
    renderCourseChrome();
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
    renderCourseChrome();
    restoreCourseTees();
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
    if (els.detailCourse) {
      const courseLine = courseSummary(found);
      els.detailCourse.hidden = !courseLine;
      els.detailCourse.textContent = courseLine;
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
      const yards = found.distances[i];
      const yardBit = yards != null ? ` · ${yards}yd` : "";
      if (entered) {
        const p = found.pars[i];
        cell.innerHTML = `
          <div class="n">${i + 1}H · PAR${p}${yardBit}</div>
          <div class="s">${s}</div>
          <div class="d">${formatDiff(s - p)}</div>
        `;
      } else if (found.courseHoles[i]) {
        cell.innerHTML = `
          <div class="n">${i + 1}H · PAR${found.pars[i]}${yardBit}</div>
          <div class="s">—</div>
          <div class="d">未入力</div>
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
    if (r.courseName) {
      const sourceNote = r.courseSource === "name-only" ? "（ホールデータなし・PARは手入力）" : "";
      lines.push(`- コース: ${r.courseName}${sourceNote}`);
      if (r.courseAreas && r.courseAreas.length) lines.push(`- エリア: ${r.courseAreas.join(" / ")}`);
      if (r.courseTee) lines.push(`- ティー: ${r.courseTee}`);
      const yardTotal = (r.distances || []).reduce((sum, yards) => (yards != null ? sum + yards : sum), 0);
      const yardCount = (r.distances || []).filter((yards) => yards != null).length;
      if (yardCount) lines.push(`- ヤーデージ: **${yardTotal}** yd（コースデータ ${yardCount}ホール分）`);
      if (r.courseUrl) lines.push(`- コース情報: ${r.courseUrl}`);
    }
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
    lines.push("| ホール | サイド | PAR | ヤード | 打数 | 差 |");
    lines.push("| ---: | :--- | ---: | ---: | ---: | ---: |");
    for (let i = 0; i < HOLE_COUNT; i++) {
      const side = i < 9 ? "OUT" : "IN";
      const yards = r.distances && r.distances[i] != null ? String(r.distances[i]) : "-";
      if (!isEntered(r.scores[i])) {
        if (r.courseHoles && r.courseHoles[i]) {
          lines.push(`| ${i + 1} | ${side} | ${r.pars[i]} | ${yards} | - | - |`);
        } else {
          lines.push(`| ${i + 1} | ${side} | - | - | - | - |`);
        }
      } else {
        const par = r.pars[i];
        const score = r.scores[i];
        lines.push(`| ${i + 1} | ${side} | ${par} | ${yards} | ${score} | ${formatDiff(score - par)} |`);
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
    lines.push("| # | 日付 | 状態 | コース | 入力 | 合計 | PAR計 | 差 | OUT | IN | メモ |");
    lines.push("| ---: | :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |");
    sorted.forEach((r, idx) => {
      const total = mdAggregate(r.scores, r.pars, 0, HOLE_COUNT);
      const out = mdAggregate(r.scores, r.pars, 0, 9);
      const inn = mdAggregate(r.scores, r.pars, 9, 18);
      const memo = escapeMdCell((r.memo || "").trim() || "—");
      const course = escapeMdCell(r.courseName || "—");
      lines.push(
        `| ${idx + 1} | ${r.date || "—"} | ${statusLabel(r.status)} | ${course} | ${countEntered(r.scores)}/${HOLE_COUNT} | ${total.score} | ${total.par} | ${total.diff} | ${out.score} | ${inn.score} | ${memo} |`
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

  function activateCourseTab(which) {
    const course = which === "course";
    if (els.tabManual) els.tabManual.setAttribute("aria-selected", course ? "false" : "true");
    if (els.tabCourse) els.tabCourse.setAttribute("aria-selected", course ? "true" : "false");
    if (els.coursePanel) els.coursePanel.hidden = !course;
  }

  function renderNameBanner() {
    if (!els.courseBanner) return;
    if (editing && editing.courseSource === "name-only" && editing.courseName) {
      els.courseBanner.hidden = false;
      els.courseBanner.textContent = `コース名「${editing.courseName}」だけ残しています。PARは手入力してください。`;
    } else {
      els.courseBanner.hidden = true;
      els.courseBanner.textContent = "";
    }
  }

  function renderChosen() {
    if (!els.courseChosen || !editing) return;
    if (editing.courseSource !== "golfcore" || !editing.courseName) {
      els.courseChosen.hidden = true;
      els.courseChosen.innerHTML = "";
      return;
    }
    const areas = editing.courseAreas.length ? escapeHtml(editing.courseAreas.join(" / ")) : "";
    const tee = editing.courseTee ? escapeHtml(editing.courseTee) : "";
    els.courseChosen.hidden = false;
    els.courseChosen.innerHTML = `
      <div class="chosen-card">
        <strong>${escapeHtml(editing.courseName)}</strong>
        <div class="chosen-meta">${[areas, tee].filter(Boolean).join(" · ") || "スコアカードを反映しました"}</div>
      </div>
      <button type="button" class="btn btn-secondary" id="btn-course-clear">選び直す</button>
    `;
    const clearBtn = document.getElementById("btn-course-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        dropCourseLink({ toast: false });
        activateCourseTab("course");
        showToast("コース情報を外しました。PARは手入力のままです");
        if (els.courseQuery) els.courseQuery.focus();
      });
    }
  }

  function renderCourseChrome() {
    courseSearchSeq += 1;
    pendingCourse = null;
    areaPick = [];
    if (els.courseQuery) els.courseQuery.value = "";
    if (els.courseStatus) els.courseStatus.textContent = "";
    if (els.courseResults) els.courseResults.innerHTML = "";
    if (els.coursePicker) {
      els.coursePicker.hidden = true;
      els.coursePicker.innerHTML = "";
    }
    const linked = editing && editing.courseSource === "golfcore";
    activateCourseTab(linked ? "course" : "manual");
    renderChosen();
    renderNameBanner();
    if (els.holeSectionTitle) {
      els.holeSectionTitle.textContent = linked ? "各ホール（PAR・ヤード・打数）" : "各ホール（PARと打数）";
    }
  }

  function dropCourseLink({ toast = true } = {}) {
    if (!editing) return;
    const pars = editing.pars.slice();
    const scores = editing.scores.slice();
    Object.assign(editing, emptyCourseFields());
    editing.pars = pars;
    editing.scores = scores;
    pendingCourse = null;
    areaPick = [];
    if (els.coursePicker) {
      els.coursePicker.hidden = true;
      els.coursePicker.innerHTML = "";
    }
    if (els.courseResults) els.courseResults.innerHTML = "";
    if (els.courseStatus) els.courseStatus.textContent = "";
    commitEditing();
    renderHoleGrid();
    renderChosen();
    renderNameBanner();
    if (els.holeSectionTitle) els.holeSectionTitle.textContent = "各ホール（PARと打数）";
    if (toast) showToast("コース情報を外しました。PARは手入力のままです");
  }

  function useNameOnly(name) {
    if (!editing) return;
    const pars = editing.pars.slice();
    const scores = editing.scores.slice();
    Object.assign(editing, emptyCourseFields());
    editing.pars = pars;
    editing.scores = scores;
    editing.courseName = String(name || "").trim();
    editing.courseSource = editing.courseName ? "name-only" : "";
    pendingCourse = null;
    areaPick = [];
    commitEditing({ force: !!editing.courseName });
    activateCourseTab("manual");
    renderHoleGrid();
    renderChosen();
    renderNameBanner();
    if (els.coursePicker) els.coursePicker.hidden = true;
    if (els.holeSectionTitle) els.holeSectionTitle.textContent = "各ホール（PARと打数）";
    showToast("ホールデータがないため、PARは手入力です");
  }

  function courseErrorMessage(err) {
    const status = err && err.status;
    if (status === 401 || status === 403) {
      return "コース検索にはAPIキーが必要になりました。この静的アプリには秘密鍵を置けないので、手入力にしてください。";
    }
    if (status === 429) return "検索が混み合っています。少し待ってからもう一度どうぞ。";
    return "コース検索に接続できませんでした。通信できるときは再検索し、なければ手入力にしてください。";
  }

  function renderNameOnlyAction(name) {
    if (!els.courseResults || !name) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary";
    btn.textContent = "この名前で手入力";
    btn.addEventListener("click", () => useNameOnly(name));
    els.courseResults.appendChild(btn);
  }

  function applyCourseCard(classified, card) {
    if (!editing || !card) return;
    const scores = editing.scores.slice();
    Object.assign(editing, emptyCourseFields());
    editing.scores = scores;
    editing.pars = Array.from({ length: HOLE_COUNT }, () => DEFAULT_PAR);
    editing.courseName = classified.name;
    editing.courseSource = "golfcore";
    editing.courseSlug = classified.slug;
    editing.courseUrl = classified.url || "";
    editing.courseAreas = card.areas.slice();
    editing.courseTee = card.tee || "";
    card.holes.forEach((hole, index) => {
      if (!hole || index >= HOLE_COUNT) return;
      editing.pars[index] = hole.par;
      editing.distances[index] = hole.yards;
      editing.courseHoles[index] = true;
    });
    pendingCourse = classified;
    commitEditing({ force: true });
    activateCourseTab("course");
    renderChosen();
    renderNameBanner();
    if (els.holeSectionTitle) els.holeSectionTitle.textContent = "各ホール（PAR・ヤード・打数）";
    renderHoleGrid();
  }

  function renderTeeChoices(layout, selectedId) {
    if (!els.coursePicker || !layout || layout.tees.length < 2) return;
    els.coursePicker.hidden = false;
    els.coursePicker.innerHTML = "";
    const label = document.createElement("p");
    label.className = "course-status";
    label.textContent = "ティー（ヤードが変わります。打数はそのままです）";
    const row = document.createElement("div");
    row.className = "tee-row";
    layout.tees.forEach((tee) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `tee-choice${tee.id === selectedId ? " selected" : ""}`;
      btn.textContent = tee.id;
      btn.addEventListener("click", () => {
        if (!pendingCourse) return;
        const card = GolfCourses.cardFromSelection(pendingCourse, {
          mode: "18",
          key: layout.key,
          teeId: tee.id,
        });
        applyCourseCard(pendingCourse, card);
        renderTeeChoices(layout, tee.id);
      });
      row.appendChild(btn);
    });
    els.coursePicker.appendChild(label);
    els.coursePicker.appendChild(row);
  }

  function paintNineSelection() {
    if (!els.coursePicker) return;
    els.coursePicker.querySelectorAll(".area-choice").forEach((btn) => {
      const order = areaPick.indexOf(btn.dataset.key);
      btn.classList.toggle("selected", order >= 0);
      const badge = btn.querySelector(".area-badge");
      if (!badge) return;
      if (order === 0) {
        badge.hidden = false;
        badge.textContent = "前半";
      } else if (order === 1) {
        badge.hidden = false;
        badge.textContent = "後半";
      } else {
        badge.hidden = true;
        badge.textContent = "";
      }
    });
    const go = document.getElementById("btn-apply-nines");
    if (go) go.disabled = areaPick.length !== 2;
  }

  function areaButton(layout, kind) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "area-choice";
    btn.dataset.key = layout.key;
    const yards = layout.holes.reduce((sum, hole) => sum + (hole.yards || 0), 0);
    const par = layout.holes.reduce((sum, hole) => sum + hole.par, 0);
    const yardKnown = layout.holes.some((hole) => hole.yards != null);
    btn.innerHTML = `
      <div class="area-choice-name">${escapeHtml(layout.name)} <span class="area-badge" hidden></span></div>
      <div class="area-choice-meta">${layout.kind === "9" ? "9H" : "18H"} · PAR ${par}${yardKnown ? ` · ${yards} yd` : ""}</div>
    `;
    btn.addEventListener("click", () => {
      if (!pendingCourse) return;
      if (kind === "18") {
        const card = GolfCourses.cardFromSelection(pendingCourse, {
          mode: "18",
          key: layout.key,
          teeId: layout.defaultTeeId,
        });
        applyCourseCard(pendingCourse, card);
        renderTeeChoices(layout, card.tee);
        els.courseStatus.textContent = "この組み合わせのPARとヤードを入れました。打数は未入力のままです。";
        return;
      }
      const index = areaPick.indexOf(layout.key);
      if (index >= 0) areaPick.splice(index, 1);
      else if (areaPick.length < 2) areaPick.push(layout.key);
      else areaPick[1] = layout.key;
      paintNineSelection();
    });
    return btn;
  }

  function renderAreaPicker(classified) {
    if (!els.coursePicker) return;
    const fulls = classified.layouts.filter((layout) => layout.kind === "18");
    const nines = classified.layouts.filter((layout) => layout.kind === "9");
    els.coursePicker.hidden = false;
    els.coursePicker.innerHTML = "";
    const intro = document.createElement("p");
    intro.className = "course-status";
    intro.textContent = nines.length >= 2
      ? "前半と後半にする9ホールを、この順で2つ選んでください。"
      : "プレーする18ホールの組み合わせを選んでください。";
    els.coursePicker.appendChild(intro);
    if (fulls.length) {
      const label = document.createElement("p");
      label.className = "course-status";
      label.textContent = "18ホールの組み合わせ";
      const list = document.createElement("div");
      list.className = "area-list";
      fulls.forEach((layout) => list.appendChild(areaButton(layout, "18")));
      els.coursePicker.appendChild(label);
      els.coursePicker.appendChild(list);
    }
    if (nines.length >= 2) {
      const label = document.createElement("p");
      label.className = "course-status";
      label.textContent = "9ホール";
      const list = document.createElement("div");
      list.className = "area-list";
      nines.forEach((layout) => list.appendChild(areaButton(layout, "9")));
      els.coursePicker.appendChild(label);
      els.coursePicker.appendChild(list);
      const go = document.createElement("button");
      go.type = "button";
      go.className = "btn btn-primary";
      go.id = "btn-apply-nines";
      go.textContent = "この組み合わせで入力";
      go.disabled = true;
      go.addEventListener("click", () => {
        const card = GolfCourses.cardFromSelection(classified, {
          mode: "9",
          frontKey: areaPick[0],
          backKey: areaPick[1],
        });
        if (!card) return;
        applyCourseCard(classified, card);
        if (els.coursePicker) els.coursePicker.hidden = true;
        els.courseStatus.textContent = "選んだ2つの9ホールを前半・後半に入れました。打数は未入力のままです。";
      });
      els.coursePicker.appendChild(go);
    }
    els.courseStatus.textContent = "";
  }

  function renderSearchResults(query, result) {
    const courses = result.courses || [];
    els.courseResults.innerHTML = "";
    if (!courses.length) {
      els.courseStatus.textContent = `「${query}」は見つかりませんでした。`;
      renderNameOnlyAction(query);
      return;
    }
    els.courseStatus.textContent = courses.length === result.total
      ? `${courses.length}件`
      : `${result.total}件中 ${courses.length}件`;
    const list = document.createElement("div");
    list.className = "course-results";
    courses.forEach((course) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "course-hit";
      const holes = course.holeCount ? `${course.holeCount}H` : "ホール数不明";
      const card = course.scorecard ? "スコアカードあり" : "ホールデータなしの可能性";
      btn.innerHTML = `
        <div class="course-hit-name">${escapeHtml(course.name)}</div>
        <div class="course-hit-meta">${escapeHtml([course.city, holes, card].filter(Boolean).join(" · "))}</div>
      `;
      btn.addEventListener("click", () => selectCourse(course));
      list.appendChild(btn);
    });
    els.courseResults.appendChild(list);
  }

  async function selectCourse(hit) {
    const seq = ++courseSearchSeq;
    els.courseStatus.textContent = "ホールデータを取得しています…";
    if (els.coursePicker) {
      els.coursePicker.hidden = true;
      els.coursePicker.innerHTML = "";
    }
    try {
      const classified = await GolfCourses.fetchCourse(hit.slug);
      if (seq !== courseSearchSeq || !editing) return;
      if (!classified.name) classified.name = hit.name;
      if (classified.kind === "none") {
        useNameOnly(hit.name);
        return;
      }
      pendingCourse = classified;
      els.courseResults.innerHTML = "";
      if (classified.kind === "single-18" || classified.kind === "single-9") {
        const layout = classified.layouts[0];
        const card = GolfCourses.cardFromSelection(
          classified,
          classified.kind === "single-18"
            ? { mode: "18", key: layout.key, teeId: layout.defaultTeeId }
            : { mode: "9", frontKey: layout.key, teeId: layout.defaultTeeId }
        );
        applyCourseCard(classified, card);
        if (classified.kind === "single-18") renderTeeChoices(layout, card.tee);
        els.courseStatus.textContent = classified.kind === "single-9"
          ? "9ホール分だけデータがあります。後半は手入力してください。"
          : "PARとヤードを入れました。打数は未入力のままです。";
        return;
      }
      areaPick = [];
      renderAreaPicker(classified);
    } catch (err) {
      if (seq !== courseSearchSeq) return;
      els.courseStatus.textContent = courseErrorMessage(err);
      renderNameOnlyAction(hit.name);
    }
  }

  async function runCourseSearch() {
    if (!editing || !els.courseQuery) return;
    const query = els.courseQuery.value.trim();
    const seq = ++courseSearchSeq;
    pendingCourse = null;
    areaPick = [];
    if (els.coursePicker) {
      els.coursePicker.hidden = true;
      els.coursePicker.innerHTML = "";
    }
    if (query.length < 2) {
      if (els.courseStatus) els.courseStatus.textContent = query ? "2文字以上で検索します" : "";
      if (els.courseResults) els.courseResults.innerHTML = "";
      return;
    }
    if (els.courseStatus) els.courseStatus.textContent = "検索しています…";
    if (els.courseResults) els.courseResults.innerHTML = "";
    try {
      const result = await GolfCourses.searchCourses(query);
      if (seq !== courseSearchSeq || !editing) return;
      renderSearchResults(query, result);
    } catch (err) {
      if (seq !== courseSearchSeq || !editing) return;
      if (els.courseStatus) els.courseStatus.textContent = courseErrorMessage(err);
      if (els.courseResults) els.courseResults.innerHTML = "";
      renderNameOnlyAction(query);
    }
  }

  function scheduleCourseSearch() {
    clearTimeout(courseSearchTimer);
    courseSearchTimer = setTimeout(runCourseSearch, 450);
  }

  async function restoreCourseTees() {
    if (!editing || editing.courseSource !== "golfcore" || !editing.courseSlug || !window.GolfCourses) return;
    const slug = editing.courseSlug;
    const seq = ++courseSearchSeq;
    try {
      const classified = await GolfCourses.fetchCourse(slug);
      if (seq !== courseSearchSeq || !editing || editing.courseSlug !== slug) return;
      pendingCourse = classified;
      const layout = classified.layouts.find((item) => item.name === (editing.courseAreas || [])[0] && item.kind === "18")
        || classified.layouts.find((item) => item.kind === "18");
      if (layout && layout.tees.length > 1) renderTeeChoices(layout, editing.courseTee);
    } catch {
      /* Saved par and yardage still show without a live tee list. */
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
  if (els.tabManual) {
    els.tabManual.addEventListener("click", () => {
      if (!editing) return;
      if (editing.courseSource === "golfcore") dropCourseLink();
      activateCourseTab("manual");
    });
  }
  if (els.tabCourse) {
    els.tabCourse.addEventListener("click", () => {
      if (!editing) return;
      activateCourseTab("course");
      renderChosen();
    });
  }
  if (els.courseQuery) {
    els.courseQuery.addEventListener("input", (event) => {
      if (event.isComposing) return;
      scheduleCourseSearch();
    });
    els.courseQuery.addEventListener("compositionend", scheduleCourseSearch);
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
