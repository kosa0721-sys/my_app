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
   * @typedef {{
   *   id: string,
   *   date: string,
   *   memo: string,
   *   scores: number[],
   *   pars: number[],
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
    btnExportAll: document.getElementById("btn-export-all"),
    btnExportOne: document.getElementById("btn-export-one"),
    editDate: document.getElementById("edit-date"),
    editMemo: document.getElementById("edit-memo"),
    holeGrid: document.getElementById("hole-grid"),
    sumTotal: document.getElementById("sum-total"),
    sumOut: document.getElementById("sum-out"),
    sumIn: document.getElementById("sum-in"),
    sumPar: document.getElementById("sum-par"),
    sumDiff: document.getElementById("sum-diff"),
    btnSave: document.getElementById("btn-save"),
    btnDeleteEdit: document.getElementById("btn-delete-edit"),
    detailDate: document.getElementById("detail-date"),
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
    if (!Number.isFinite(n)) return DEFAULT_STROKES;
    return Math.min(MAX_STROKES, Math.max(1, Math.round(n)));
  }

  function clampPar(n) {
    const v = Math.round(Number(n));
    if (PAR_CHOICES.includes(v)) return v;
    return DEFAULT_PAR;
  }

  function normalizeRound(r) {
    const scores = Array.isArray(r.scores)
      ? r.scores.map((n) => clampScore(Number(n) || DEFAULT_STROKES))
      : Array.from({ length: HOLE_COUNT }, () => DEFAULT_STROKES);
    while (scores.length < HOLE_COUNT) scores.push(DEFAULT_STROKES);
    scores.length = HOLE_COUNT;

    let pars;
    if (Array.isArray(r.pars) && r.pars.length) {
      pars = r.pars.map((n) => clampPar(n));
    } else {
      pars = Array.from({ length: HOLE_COUNT }, () => DEFAULT_PAR);
    }
    while (pars.length < HOLE_COUNT) pars.push(DEFAULT_PAR);
    pars.length = HOLE_COUNT;

    return {
      id: String(r.id || uid()),
      date: String(r.date || ""),
      memo: String(r.memo || ""),
      scores,
      pars,
      createdAt: String(r.createdAt || new Date().toISOString()),
      updatedAt: String(r.updatedAt || r.createdAt || new Date().toISOString()),
    };
  }

  function loadRounds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(normalizeRound)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          return a.updatedAt < b.updatedAt ? 1 : -1;
        });
    } catch {
      return [];
    }
  }

  function saveRounds() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
  }

  function sumRange(arr, start, end) {
    let t = 0;
    for (let i = start; i < end; i++) t += arr[i];
    return t;
  }

  function totalOf(scores) {
    return sumRange(scores, 0, HOLE_COUNT);
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
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function blankRound() {
    return {
      id: uid(),
      date: todayISO(),
      memo: "",
      scores: Array.from({ length: HOLE_COUNT }, () => DEFAULT_STROKES),
      pars: Array.from({ length: HOLE_COUNT }, () => DEFAULT_PAR),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderHome() {
    setView("home", "ゴルフスコア帳");

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
    const total = totalOf(latest.scores);
    const parTotal = totalOf(latest.pars);
    els.latestScore.textContent = String(total);
    els.latestMeta.textContent = `${formatDateJP(latest.date)} · ${formatDiff(total - parTotal)} · ${rounds.length}ラウンド`;

    els.roundList.innerHTML = "";
    rounds.forEach((r) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "round-item";
      btn.setAttribute("aria-label", `${formatDateJP(r.date)} のラウンドを開く`);
      const memo = (r.memo || "").trim();
      const totalScore = totalOf(r.scores);
      const diff = totalScore - totalOf(r.pars);
      btn.innerHTML = `
        <div class="round-item-main">
          <div class="round-item-date">${escapeHtml(formatDateJP(r.date))}</div>
          <div class="round-item-meta">${escapeHtml(memo || "メモなし")} · OUT ${sumRange(r.scores, 0, 9)} / IN ${sumRange(r.scores, 9, 18)} · ${formatDiff(diff)}</div>
        </div>
        <div class="round-item-score">${totalScore}</div>
      `;
      btn.addEventListener("click", () => openDetail(r.id));
      li.appendChild(btn);
      els.roundList.appendChild(li);
    });
  }

  function updateEditSummary() {
    if (!editing) return;
    const total = totalOf(editing.scores);
    const parTotal = totalOf(editing.pars);
    els.sumTotal.textContent = String(total);
    els.sumOut.textContent = String(sumRange(editing.scores, 0, 9));
    els.sumIn.textContent = String(sumRange(editing.scores, 9, 18));
    if (els.sumPar) els.sumPar.textContent = String(parTotal);
    if (els.sumDiff) els.sumDiff.textContent = formatDiff(total - parTotal);
  }

  function isPresetStroke(n) {
    return STROKE_CHOICES.includes(n);
  }

  function renderHoleGrid() {
    els.holeGrid.innerHTML = "";
    if (!editing) return;
    if (otherOpen.length !== HOLE_COUNT) {
      otherOpen = editing.scores.map((s) => !isPresetStroke(s));
    }

    for (let i = 0; i < HOLE_COUNT; i++) {
      const side = i < 9 ? "OUT" : "IN";
      const score = editing.scores[i];
      const par = editing.pars[i];
      const useOther = otherOpen[i] || !isPresetStroke(score);
      otherOpen[i] = useOther;
      const holeDiff = score - par;

      const card = document.createElement("article");
      card.className = "hole-card";
      card.dataset.hole = String(i);

      const parBtns = PAR_CHOICES.map(
        (p) =>
          `<button type="button" class="chip chip-par${p === par ? " selected" : ""}" data-par="${p}" aria-pressed="${p === par}">PAR${p}</button>`
      ).join("");

      const strokeBtns = STROKE_CHOICES.map(
        (s) =>
          `<button type="button" class="chip chip-stroke${!useOther && s === score ? " selected" : ""}" data-stroke="${s}" aria-pressed="${!useOther && s === score}">${s}</button>`
      ).join("");

      card.innerHTML = `
        <div class="hole-card-head">
          <div class="hole-label">
            ${i + 1}H
            <small>${side}</small>
          </div>
          <div class="hole-result" aria-live="polite">
            <span class="hole-result-score">${score}</span>
            <span class="hole-result-meta">PAR${par} · ${formatDiff(holeDiff)}</span>
          </div>
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
              value="${score}"
              aria-label="${i + 1}番ホールの打数（自由入力）"
            />
          </div>
        </div>
      `;

      card.querySelectorAll("[data-par]").forEach((btn) => {
        btn.addEventListener("click", () => {
          editing.pars[i] = clampPar(Number(btn.getAttribute("data-par")));
          refreshHoleCard(i);
          updateEditSummary();
        });
      });

      card.querySelectorAll("[data-stroke]").forEach((btn) => {
        btn.addEventListener("click", () => {
          otherOpen[i] = false;
          editing.scores[i] = clampScore(Number(btn.getAttribute("data-stroke")));
          refreshHoleCard(i);
          updateEditSummary();
        });
      });

      card.querySelector("[data-other]").addEventListener("click", () => {
        otherOpen[i] = true;
        refreshHoleCard(i);
        updateEditSummary();
        const input = els.holeGrid.querySelector(`#other-${i}`);
        if (input) {
          input.focus();
          input.select();
        }
      });

      const otherInput = card.querySelector(".other-input");
      otherInput.addEventListener("input", () => {
        const raw = otherInput.value;
        if (raw === "") return;
        editing.scores[i] = clampScore(Number(raw));
        otherOpen[i] = true;
        // update result display without full rebuild of focus
        const resultScore = card.querySelector(".hole-result-score");
        const resultMeta = card.querySelector(".hole-result-meta");
        resultScore.textContent = String(editing.scores[i]);
        resultMeta.textContent = `PAR${editing.pars[i]} · ${formatDiff(editing.scores[i] - editing.pars[i])}`;
        updateEditSummary();
      });
      otherInput.addEventListener("change", () => {
        editing.scores[i] = clampScore(Number(otherInput.value) || 1);
        otherInput.value = String(editing.scores[i]);
        refreshHoleCard(i);
        updateEditSummary();
      });
      otherInput.addEventListener("blur", () => {
        editing.scores[i] = clampScore(Number(otherInput.value) || 1);
        otherInput.value = String(editing.scores[i]);
        updateEditSummary();
      });

      els.holeGrid.appendChild(card);
    }
  }

  function refreshHoleCard(index) {
    // Rebuild all for simplicity & consistent selected states
    const scrollY = window.scrollY;
    const activeId = document.activeElement && document.activeElement.id;
    renderHoleGrid();
    window.scrollTo(0, scrollY);
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) el.focus();
    }
  }

  function openNew() {
    editing = blankRound();
    otherOpen = Array.from({ length: HOLE_COUNT }, () => false);
    els.editDate.value = editing.date;
    els.editMemo.value = "";
    els.btnDeleteEdit.hidden = true;
    setView("edit", "新しいラウンド");
    renderHoleGrid();
    updateEditSummary();
  }

  function openEdit(id) {
    const found = rounds.find((r) => r.id === id);
    if (!found) {
      showToast("ラウンドが見つかりません");
      renderHome();
      return;
    }
    editing = {
      ...found,
      scores: found.scores.slice(),
      pars: found.pars.slice(),
    };
    otherOpen = editing.scores.map((s) => !isPresetStroke(s));
    els.editDate.value = editing.date;
    els.editMemo.value = editing.memo || "";
    els.btnDeleteEdit.hidden = false;
    setView("edit", "ラウンドを編集");
    renderHoleGrid();
    updateEditSummary();
  }

  function openDetail(id) {
    const found = rounds.find((r) => r.id === id);
    if (!found) {
      showToast("ラウンドが見つかりません");
      renderHome();
      return;
    }
    detailId = id;
    const total = totalOf(found.scores);
    const parTotal = totalOf(found.pars);
    els.detailDate.textContent = formatDateJP(found.date);
    const memo = (found.memo || "").trim();
    els.detailMemo.textContent = memo || "メモなし";
    els.detailMemo.style.opacity = memo ? "1" : "0.7";
    els.detailTotal.textContent = String(total);
    els.detailOut.textContent = String(sumRange(found.scores, 0, 9));
    els.detailIn.textContent = String(sumRange(found.scores, 9, 18));
    if (els.detailPar) els.detailPar.textContent = String(parTotal);
    if (els.detailDiff) els.detailDiff.textContent = formatDiff(total - parTotal);

    els.detailHoles.innerHTML = "";
    found.scores.forEach((s, i) => {
      const cell = document.createElement("div");
      cell.className = "detail-hole";
      const p = found.pars[i];
      cell.innerHTML = `
        <div class="n">${i + 1}H · PAR${p}</div>
        <div class="s">${s}</div>
        <div class="d">${formatDiff(s - p)}</div>
      `;
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

  function roundToMarkdown(r, { headingLevel = 2 } = {}) {
    const h = "#".repeat(headingLevel);
    const total = totalOf(r.scores);
    const parTotal = totalOf(r.pars);
    const out = sumRange(r.scores, 0, 9);
    const inn = sumRange(r.scores, 9, 18);
    const outPar = sumRange(r.pars, 0, 9);
    const inPar = sumRange(r.pars, 9, 18);
    const memo = (r.memo || "").trim() || "（なし）";
    const lines = [];
    lines.push(`${h} ラウンド ${formatDateJP(r.date)}`);
    lines.push("");
    lines.push(`- 日付: ${r.date || "（未設定）"}`);
    lines.push(`- メモ: ${memo}`);
    lines.push(`- 合計打数: **${total}**`);
    lines.push(`- PAR計: **${parTotal}**`);
    lines.push(`- 差: **${formatDiff(total - parTotal)}**`);
    lines.push(`- OUT (1–9): ${out}（PAR ${outPar} / ${formatDiff(out - outPar)}）`);
    lines.push(`- IN (10–18): ${inn}（PAR ${inPar} / ${formatDiff(inn - inPar)}）`);
    lines.push(`- 記録ID: \`${r.id}\``);
    lines.push("");
    lines.push("### ホール別スコア");
    lines.push("");
    lines.push("| ホール | サイド | PAR | 打数 | 差 |");
    lines.push("| ---: | :--- | ---: | ---: | ---: |");
    for (let i = 0; i < HOLE_COUNT; i++) {
      const side = i < 9 ? "OUT" : "IN";
      const par = r.pars[i];
      const score = r.scores[i];
      lines.push(
        `| ${i + 1} | ${side} | ${par} | ${score} | ${formatDiff(score - par)} |`
      );
    }
    lines.push("");
    lines.push("| 集計 | 打数 | PAR | 差 |");
    lines.push("| :--- | ---: | ---: | ---: |");
    lines.push(`| OUT | ${out} | ${outPar} | ${formatDiff(out - outPar)} |`);
    lines.push(`| IN | ${inn} | ${inPar} | ${formatDiff(inn - inPar)} |`);
    lines.push(`| 合計 | ${total} | ${parTotal} | ${formatDiff(total - parTotal)} |`);
    lines.push("");
    return lines.join("\n");
  }

  function allRoundsToMarkdown(list) {
    const sorted = list.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
    const lines = [];
    lines.push("# ゴルフスコア記録（全履歴）");
    lines.push("");
    lines.push(`- 書き出し日: ${formatDateJP(todayISO())}`);
    lines.push(`- ラウンド数: ${sorted.length}`);
    lines.push("");
    lines.push("## 一覧");
    lines.push("");
    lines.push("| # | 日付 | 合計 | PAR計 | 差 | OUT | IN | メモ |");
    lines.push("| ---: | :--- | ---: | ---: | ---: | ---: | ---: | :--- |");
    sorted.forEach((r, idx) => {
      const total = totalOf(r.scores);
      const parTotal = totalOf(r.pars);
      const memo = escapeMdCell((r.memo || "").trim() || "—");
      lines.push(
        `| ${idx + 1} | ${r.date || "—"} | ${total} | ${parTotal} | ${formatDiff(total - parTotal)} | ${sumRange(r.scores, 0, 9)} | ${sumRange(r.scores, 9, 18)} | ${memo} |`
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
    // sync any open other inputs
    for (let i = 0; i < HOLE_COUNT; i++) {
      const input = document.getElementById(`other-${i}`);
      if (input && otherOpen[i]) {
        editing.scores[i] = clampScore(Number(input.value) || 1);
      }
      editing.scores[i] = clampScore(editing.scores[i]);
      editing.pars[i] = clampPar(editing.pars[i]);
    }

    const date = els.editDate.value || todayISO();
    const memo = els.editMemo.value.trim();
    editing.date = date;
    editing.memo = memo;
    editing.updatedAt = new Date().toISOString();

    const idx = rounds.findIndex((r) => r.id === editing.id);
    if (idx >= 0) {
      rounds[idx] = {
        ...editing,
        scores: editing.scores.slice(),
        pars: editing.pars.slice(),
      };
      showToast("ラウンドを更新しました");
    } else {
      rounds.unshift({
        ...editing,
        scores: editing.scores.slice(),
        pars: editing.pars.slice(),
      });
      showToast("ラウンドを保存しました");
    }

    rounds.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
    saveRounds();
    const savedId = editing.id;
    editing = null;
    openDetail(savedId);
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
    detailId = null;
    showToast("削除しました");
    renderHome();
  }

  function goBack() {
    if (currentView === "edit") {
      if (detailId && rounds.some((r) => r.id === detailId)) {
        openDetail(detailId);
      } else {
        editing = null;
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
  els.backBtn.addEventListener("click", goBack);
  els.btnSave.addEventListener("click", saveEditing);
  if (els.btnExportAll) {
    els.btnExportAll.addEventListener("click", exportAllRounds);
  }
  if (els.btnExportOne) {
    els.btnExportOne.addEventListener("click", () => {
      if (detailId) exportOneRound(detailId);
    });
  }
  els.btnEdit.addEventListener("click", () => {
    if (detailId) openEdit(detailId);
  });
  els.btnDeleteEdit.addEventListener("click", () => {
    if (editing) deleteById(editing.id);
  });
  els.btnDeleteDetail.addEventListener("click", () => {
    if (detailId) deleteById(detailId);
  });
  els.confirmCancel.addEventListener("click", () => closeConfirm(false));
  els.confirmOk.addEventListener("click", () => closeConfirm(true));
  els.confirm.addEventListener("click", (e) => {
    if (e.target === els.confirm) closeConfirm(false);
  });

  rounds = loadRounds();
  renderHome();
})();
