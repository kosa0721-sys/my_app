'use strict';
// ---- 気持ちの定義 ----
const MOODS = {
  amae:   { name: '甘えたい・うれしい', emoji: '🥰', voices: ['なでてほしいニャ', 'だいすきだニャ〜', 'かまってほしいニャ'],
            tip: 'やさしく声をかけて、あご下やほっぺをゆっくりなでてあげましょう。猫が離れたら深追いしないのがコツです。' },
  relax:  { name: 'リラックス', emoji: '😌', voices: ['いい気分だニャ…', 'ここは安心だニャ', 'ぽかぽかだニャ'],
            tip: '安心してくつろいでいます。無理に抱っこしたり起こしたりせず、静かに見守ってあげましょう。' },
  play:   { name: '興味しんしん・遊びたい', emoji: '😺', voices: ['あれ気になるニャ！', 'あそぼうニャ！', 'つかまえたいニャ！'],
            tip: 'じゃらしなどのおもちゃで5〜10分遊んであげましょう。最後に「捕まえさせて」終わると満足しやすいです。' },
  fear:   { name: '不安・こわい', emoji: '🙀', voices: ['こわいニャ…', 'そっとしておいてニャ', 'どこかに隠れたいニャ'],
            tip: '大きな音や急な動きを避け、隠れられる場所を用意して距離をとりましょう。落ち着くまで無理に触らないでください。' },
  angry:  { name: 'イライラ・怒り', emoji: '😾', voices: ['さわらないでニャ！', 'いまは放っておいてニャ', 'もう怒ったニャ！'],
            tip: '手を出すとケガをすることがあります。目を合わせずにその場から離れ、原因（他の猫・音・しつこいなで方など）を取り除きましょう。' },
  alert:  { name: '警戒中', emoji: '👀', voices: ['なにか聞こえたニャ…', 'あやしいニャ', 'ようすを見てるニャ'],
            tip: '何かを気にしています。音やにおい、窓の外などの原因を確かめ、落ち着くまで静かに見守りましょう。' },
  demand: { name: 'お腹すいた・要求', emoji: '🍽️', voices: ['ごはんまだかニャ？', 'ねえねえ、聞いてるニャ？', 'ドアあけてほしいニャ'],
            tip: 'ごはん・水・トイレ・ドアなど、何を求めているか確認しましょう。毎回すぐ応えすぎると要求鳴きが増えることもあります。' },
};

// ---- サイン（ボタン）とスコア表 ----
// 一般的に知られている猫のボディランゲージにもとづく目安の重み
const CATEGORIES = [
  { id: 'tail', cls: 'c-tail', title: '🐈 しっぽ', multi: false, signs: [
    { id: 'tail_up',     label: 'ピンと立っている',   w: { amae: 3, demand: 2, play: 1 }, why: 'しっぽがピンと立つのは、うれしい・あいさつのサイン' },
    { id: 'tail_hook',   label: '先だけ曲がっている', w: { amae: 2, play: 2 },            why: 'しっぽの先がクルンと曲がるのは、ごきげんで好奇心があるサイン' },
    { id: 'tail_slow',   label: 'ゆっくり振る',       w: { alert: 2, relax: 1, play: 1 }, why: 'ゆっくり振るのは、何かを観察したり考えたりしているとき' },
    { id: 'tail_thrash', label: 'バタバタ激しく振る', w: { angry: 3, alert: 1 },          why: 'しっぽを激しく振るのは、イライラしているサイン' },
    { id: 'tail_puff',   label: '膨らんでいる',       w: { fear: 3, angry: 2 },           why: 'しっぽが膨らむのは、びっくり・威嚇のサイン' },
    { id: 'tail_tuck',   label: '足の間に巻き込む',   w: { fear: 4 },                     why: 'しっぽを巻き込むのは、こわくて小さくなりたいサイン' },
    { id: 'tail_wrap',   label: '体に巻きつけている', w: { relax: 2, alert: 1 },          why: 'しっぽを体に巻きつけるのは、落ち着いて休んでいるとき（寒いときも）' },
  ]},
  { id: 'ear', cls: 'c-ear', title: '👂 耳', multi: false, signs: [
    { id: 'ear_fwd',    label: '前向き',             w: { play: 2, amae: 1, relax: 1 },  why: '耳が前向きなのは、リラックスして興味を向けているサイン' },
    { id: 'ear_side',   label: '横に倒れる（イカ耳）', w: { fear: 2, angry: 2, alert: 1 }, why: 'イカ耳は、不安やイライラを感じているサイン' },
    { id: 'ear_back',   label: '後ろに伏せる',       w: { fear: 3, angry: 2 },           why: '耳を伏せるのは、こわい・身を守りたいサイン' },
    { id: 'ear_twitch', label: 'ピクピク動く',       w: { alert: 3, play: 1 },           why: '耳がピクピク動くのは、音に集中して警戒しているサイン' },
  ]},
  { id: 'eye', cls: 'c-eye', title: '👁️ 目', multi: true, signs: [
    { id: 'eye_blink',   label: 'ゆっくりまばたき', w: { amae: 3, relax: 2 },          why: 'ゆっくりまばたきは「信頼してるよ」という猫のあいさつ' },
    { id: 'eye_dilated', label: '瞳孔が大きい',     w: { play: 2, fear: 2, angry: 1 }, why: '瞳孔が大きいのは、興奮しているとき（楽しい・こわい両方）' },
    { id: 'eye_narrow',  label: '細めている',       w: { relax: 3, amae: 1 },          why: '目を細めるのは、安心して気持ちいいサイン' },
    { id: 'eye_stare',   label: 'じっと見つめる',   w: { alert: 2, demand: 2, angry: 1 }, why: 'じっと見つめるのは、何かを伝えたい・警戒しているとき' },
  ]},
  { id: 'voice', cls: 'c-voice', title: '🎵 鳴き方・声', multi: true, signs: [
    { id: 'v_short',   label: '短く高い「ニャッ」',  w: { amae: 2, demand: 1 },         why: '短く高い声は、あいさつや軽い呼びかけ' },
    { id: 'v_long',    label: '長く「ニャーオ」',    w: { demand: 4 },                  why: '長い鳴き声は、ごはんやドアなど「お願い」があるとき' },
    { id: 'v_purr',    label: 'ゴロゴロ',            w: { relax: 3, amae: 2 },          why: 'ゴロゴロは、満足して安心しているサイン（体調が悪いときに出ることも）' },
    { id: 'v_hiss',    label: 'シャー',              w: { fear: 3, angry: 3 },          why: 'シャーは「近づかないで」という威嚇' },
    { id: 'v_chatter', label: 'クラッキング（カカカ）', w: { play: 4, alert: 1 },        why: 'カカカは、鳥や虫など獲物を見つけて興奮しているとき' },
    { id: 'v_growl',   label: '低いうなり',          w: { angry: 4, fear: 1 },          why: '低いうなり声は、強い怒り・警告のサイン' },
  ]},
  { id: 'body', cls: 'c-body', title: '🐾 体・しぐさ', multi: true, signs: [
    { id: 'b_belly', label: 'お腹を見せる',            w: { relax: 3, amae: 2, play: 1 }, why: 'お腹を見せるのは、とても安心しているサイン（触られたいとは限らない）' },
    { id: 'b_rub',   label: 'スリスリする',            w: { amae: 3, demand: 2 },         why: 'スリスリは、においをつけて「好き」「かまって」と伝えるしぐさ' },
    { id: 'b_knead', label: 'ふみふみ',                w: { amae: 3, relax: 2 },          why: 'ふみふみは、子猫時代の名残りで甘えて満たされているサイン' },
    { id: 'b_groom', label: '毛づくろい',              w: { relax: 3 },                   why: '毛づくろいは、落ち着いているとき（気持ちを静めるときにも）' },
    { id: 'b_arch',  label: '背中を丸めて毛を逆立てる', w: { fear: 3, angry: 3 },          why: '背中を丸めて毛を逆立てるのは、体を大きく見せる威嚇' },
    { id: 'b_low',   label: '体を低くする',            w: { fear: 3, play: 1, alert: 1 }, why: '体を低くするのは、こわがっているか、狩りの構えのとき' },
  ]},
];

const SIGN_BY_ID = {};
CATEGORIES.forEach(c => c.signs.forEach(s => { SIGN_BY_ID[s.id] = s; }));

const HISTORY_KEY = 'cat-mood-history-v1';
const selected = new Set();
const $ = id => document.getElementById(id);

// ---- 描画 ----
function renderCategories() {
  const root = $('categories');
  root.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const card = document.createElement('section');
    card.className = 'card ' + cat.cls;
    card.innerHTML = `<div class="cat-head"><h2>${cat.title}</h2><span class="mode">${cat.multi ? '複数OK' : '1つえらぶ'}</span></div>`;
    const grid = document.createElement('div');
    grid.className = 'opts';
    cat.signs.forEach(sign => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = sign.label;
      b.dataset.id = sign.id;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => toggle(cat, sign.id));
      grid.appendChild(b);
    });
    card.appendChild(grid);
    root.appendChild(card);
  });
}

function toggle(cat, id) {
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    if (!cat.multi) cat.signs.forEach(s => selected.delete(s.id));
    selected.add(id);
  }
  syncButtons();
}

function syncButtons() {
  document.querySelectorAll('.opt').forEach(b => {
    const on = selected.has(b.dataset.id);
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('judgeBtn').disabled = selected.size === 0;
  $('hint').style.visibility = selected.size === 0 ? 'visible' : 'hidden';
}

// ---- 判定 ----
function judge() {
  const scores = {};
  Object.keys(MOODS).forEach(k => { scores[k] = 0; });
  selected.forEach(id => {
    const w = SIGN_BY_ID[id].w;
    Object.keys(w).forEach(k => { scores[k] += w[k]; });
  });
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const ranked = Object.keys(scores)
    .filter(k => scores[k] > 0)
    .sort((a, b) => scores[b] - scores[a])
    .map(k => ({ key: k, score: scores[k], pct: Math.round(scores[k] / total * 100) }));
  const top = ranked[0];
  const reasons = [...selected]
    .map(id => SIGN_BY_ID[id])
    .filter(s => s.w[top.key])
    .sort((a, b) => b.w[top.key] - a.w[top.key])
    .map(s => s.why);
  return { ranked: ranked.slice(0, 3), top, reasons };
}

const BAR_COLORS = ['linear-gradient(90deg,#f7b8c6,#e98fa5)', 'linear-gradient(90deg,#cbbcef,#a998e0)', 'linear-gradient(90deg,#ade3cc,#7fcdb0)'];

function showResult(res, save = true) {
  const mood = MOODS[res.top.key];
  $('resEmoji').textContent = mood.emoji;
  $('resMood').textContent = mood.name;
  $('resVoice').textContent = '「' + mood.voices[Math.floor(Math.random() * mood.voices.length)] + '」';
  $('resBars').innerHTML = res.ranked.map((r, i) => `
    <div class="bar-row">
      <div class="bar-label"><span>${MOODS[r.key].emoji} ${MOODS[r.key].name}</span><span>${r.pct}%</span></div>
      <div class="bar"><i data-w="${r.pct}" style="background:${BAR_COLORS[i]}"></i></div>
    </div>`).join('');
  $('resReasons').innerHTML = res.reasons.map(t => `<li>${t}</li>`).join('');
  let tip = mood.tip;
  if (selected.has('v_purr') && (selected.has('tail_tuck') || selected.has('b_low') || selected.has('ear_back'))) {
    tip += '（ゴロゴロしながら縮こまっているときは、痛みや体調不良の可能性もあります。様子が続くなら動物病院へ。）';
  }
  $('resTip').textContent = tip;
  $('selectView').hidden = true;
  $('resultView').hidden = false;
  window.scrollTo(0, 0);
  requestAnimationFrame(() => setTimeout(() => {
    document.querySelectorAll('#resBars .bar i').forEach(el => { el.style.width = el.dataset.w + '%'; });
  }, 50));
  if (save) saveHistory(res);
}

// ---- 履歴 ----
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
}
function saveHistory(res) {
  const h = loadHistory();
  h.unshift({ t: Date.now(), mood: res.top.key, pct: res.top.pct, signs: [...selected] });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 5)));
}
function renderHistory() {
  const h = loadHistory();
  $('historySec').hidden = h.length === 0;
  $('historyList').innerHTML = h.map(e => {
    const m = MOODS[e.mood]; if (!m) return '';
    const d = new Date(e.t);
    const ds = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const signs = e.signs.map(id => SIGN_BY_ID[id] ? SIGN_BY_ID[id].label : '').filter(Boolean).join('・');
    return `<li><span class="h-emoji">${m.emoji}</span><span><b>${m.name}</b><br><small>${signs}</small></span><span class="h-date">${ds}</span></li>`;
  }).join('');
}

// ---- イベント ----
function backToSelect() {
  $('resultView').hidden = true;
  $('selectView').hidden = false;
  renderHistory();
  window.scrollTo(0, 0);
}
$('judgeBtn').addEventListener('click', () => { if (selected.size) showResult(judge()); });
$('resetBtn').addEventListener('click', () => { selected.clear(); syncButtons(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('backBtn').addEventListener('click', backToSelect);
$('againBtn').addEventListener('click', () => { selected.clear(); syncButtons(); backToSelect(); });
$('clearHistory').addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });

renderCategories();
syncButtons();
renderHistory();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {}));
}
