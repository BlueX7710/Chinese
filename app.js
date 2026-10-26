(() => {
  'use strict';

  const WORDS = window.WORDS;
  const BY_ID = Object.fromEntries(WORDS.map((w) => [w.h, w]));
  const IS_EXT = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
  const MIN_NEW_PER_DAY = 3;
  const GIVE_UP_PHRASE = '我放弃';
  const TEST_BLOCK = 15; // placement test samples this many words per difficulty step
  const TEST_PER_BLOCK = 2;
  const FREQ = {
    3: { label: 'Very common', dots: '●●●' },
    2: { label: 'Common', dots: '●●○' },
    1: { label: 'Less common', dots: '●○○' },
  };

  const $app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('from');
  // Set by the iPhone Shortcuts automation (see README) so we can hand control back to it.
  const iosGate = params.get('gate') === 'ios';
  const UNLOCK_SHORTCUT = 'shortcuts://run-shortcut?name=' + encodeURIComponent('Hanzi Unlock');

  let state;
  let session = null; // active lesson, or null on the home/settings screens
  let test = null; // active placement test
  let testResult = null;
  let view = 'home';
  let lastSummary = null;

  // ---------- dates ----------

  const today = () => dayStr();

  function addDays(str, n) {
    const [y, m, d] = str.split('-').map(Number);
    return dayStr(new Date(y, m - 1, d + n));
  }

  // ---------- storage ----------

  function defaultState() {
    return {
      cards: {},
      completedDays: [],
      newToday: { date: '', count: 0 },
      settings: { newPerDay: 5, blocklist: [...DEFAULT_BLOCKLIST] },
      stats: { answered: 0, correct: 0 },
      placement: null, // set once the placement test is taken or skipped
    };
  }

  async function load() {
    let saved = null;
    if (IS_EXT) {
      saved = (await chrome.storage.local.get('state')).state;
    } else {
      try {
        saved = JSON.parse(localStorage.getItem('state'));
      } catch {
        saved = null;
      }
    }
    const base = defaultState();
    state = Object.assign(base, saved || {});
    state.settings = Object.assign(defaultState().settings, state.settings);
    state.stats = Object.assign(defaultState().stats, state.stats);
  }

  function save() {
    if (IS_EXT) return chrome.storage.local.set({ state });
    try {
      localStorage.setItem('state', JSON.stringify(state));
    } catch {
      // Storage unavailable (private mode etc.); progress lives only in memory.
    }
  }

  // ---------- helpers ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const TONES = {
    ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
    ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
    ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
    ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
    ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
    ǖ: ['v', 1], ǘ: ['v', 2], ǚ: ['v', 3], ǜ: ['v', 4],
  };

  // Reduce pinyin (tone marks or tone numbers) to "letters|tones" so that
  // "nǐ hǎo", "ni3hao3" and "ni3 hao3" all compare equal. Neutral tone (5/0) is ignored.
  function pinyinKey(s) {
    s = s.toLowerCase().normalize('NFC').replace(/u:|ü/g, 'v');
    let letters = '';
    let tones = '';
    for (const ch of s) {
      if (TONES[ch]) {
        letters += TONES[ch][0];
        tones += TONES[ch][1];
      } else if (/[a-z]/.test(ch)) {
        letters += ch;
      } else if (/[1-4]/.test(ch)) {
        tones += ch;
      }
    }
    return letters + '|' + tones;
  }

  // ---------- speech ----------

  let zhVoice = null;

  function findVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    zhVoice =
      voices.find((v) => /^zh[-_]CN/i.test(v.lang)) ||
      voices.find((v) => /^zh/i.test(v.lang)) ||
      null;
  }

  if ('speechSynthesis' in window) {
    findVoice();
    speechSynthesis.addEventListener('voiceschanged', findVoice);
  }

  const canSpeak = () => !!zhVoice;

  function speak(text) {
    if (!canSpeak()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = zhVoice;
    u.lang = zhVoice.lang;
    u.rate = 0.8;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ---------- scheduling ----------

  function introducedToday() {
    return state.newToday.date === today() ? state.newToday.count : 0;
  }

  function unlearnedIds() {
    return WORDS.filter((w) => !state.cards[w.h]).map((w) => w.h);
  }

  function dueIds() {
    const t = today();
    return Object.keys(state.cards).filter((id) => BY_ID[id] && state.cards[id].due <= t);
  }

  function newLeftToday() {
    const quota = Math.max(0, state.settings.newPerDay - introducedToday());
    return Math.min(quota, unlearnedIds().length);
  }

  function remainingToday() {
    return { reviews: dueIds().length, fresh: newLeftToday() };
  }

  function checkComplete() {
    const r = remainingToday();
    const t = today();
    if (r.reviews === 0 && r.fresh === 0 && !state.completedDays.includes(t)) {
      state.completedDays.push(t);
      save();
    }
  }

  function streak() {
    const days = new Set(state.completedDays);
    let d = today();
    if (!days.has(d)) d = addDays(d, -1);
    let n = 0;
    while (days.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  function lostStreak() {
    // Length of the streak that ended before yesterday, if any — for shaming purposes.
    const days = new Set(state.completedDays);
    if (days.has(today()) || days.has(addDays(today(), -1))) return 0;
    const sorted = [...state.completedDays].sort();
    if (!sorted.length) return 0;
    let d = sorted[sorted.length - 1];
    let n = 0;
    while (days.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  function schedule(id, clean) {
    const c = state.cards[id];
    if (!clean) {
      c.interval = 1;
    } else {
      c.interval = c.interval === 0 ? 1 : Math.max(c.interval + 1, Math.round(c.interval * c.ease));
      c.ease = Math.min(3, c.ease + 0.05);
    }
    c.reps++;
    c.due = addDays(today(), c.interval);
  }

  function pickType(id, exclude) {
    const c = state.cards[id];
    const types = ['meaning', 'hanzi'];
    if (canSpeak()) types.push('listen');
    if (c && c.interval >= 2) types.push('pinyin', 'pinyin');
    const allowed = types.filter((t) => t !== exclude);
    return pick(allowed.length ? allowed : types);
  }

  // ---------- sessions ----------

  function startDaily() {
    const queue = [];
    const need = {};
    for (const id of shuffle(dueIds())) {
      queue.push({ id, type: pickType(id) });
      need[id] = 1;
    }
    unlearnedIds()
      .slice(0, newLeftToday())
      .forEach((id, i) => {
        need[id] = 2;
        queue.splice(Math.min(queue.length, i * 3), 0, { id, type: 'intro' }, { id, type: 'meaning' });
        queue.push({ id, type: 'pinyin' });
      });
    beginSession('daily', queue, need);
  }

  function startPractice() {
    const learned = Object.keys(state.cards).filter((id) => BY_ID[id]);
    const ids = shuffle(learned).slice(0, 10);
    const need = {};
    const queue = ids.map((id) => {
      need[id] = 1;
      return { id, type: pickType(id) };
    });
    beginSession('practice', queue, need);
  }

  function beginSession(mode, queue, need) {
    if (!queue.length) return;
    session = { mode, queue, need, failed: new Set(), total: queue.length, done: 0, current: null, answer: null };
    next();
  }

  function next() {
    session.current = session.queue.shift() || null;
    session.answer = null;
    if (!session.current) return finishSession();
    const { id, type } = session.current;
    if (type === 'intro') {
      if (!state.cards[id]) {
        state.cards[id] = { interval: 0, ease: 2.5, due: today(), reps: 0, lapses: 0 };
        if (state.newToday.date !== today()) state.newToday = { date: today(), count: 0 };
        state.newToday.count++;
        save();
      }
      speak(BY_ID[id].h);
    } else {
      session.current.options = buildOptions(id, type);
      if (type === 'listen') speak(BY_ID[id].h);
    }
    render();
  }

  function buildOptions(id, type) {
    if (type === 'pinyin') return null;
    const word = BY_ID[id];
    const key = type === 'meaning' ? (w) => w.m : type === 'hanzi' ? (w) => w.m : (w) => pinyinKey(w.p);
    const seen = new Set([key(word)]);
    const others = [];
    for (const w of shuffle(WORDS)) {
      if (w === word || seen.has(key(w))) continue;
      seen.add(key(w));
      others.push(w);
      if (others.length === 3) break;
    }
    return shuffle([word, ...others]);
  }

  function answer(correct, given) {
    const { id, type } = session.current;
    session.answer = { correct, given };
    session.done++;
    state.stats.answered++;
    if (correct) state.stats.correct++;

    if (correct) {
      session.need[id]--;
      if (session.need[id] <= 0 && session.mode === 'daily') schedule(id, !session.failed.has(id));
    } else {
      if (session.mode === 'daily' && !session.failed.has(id)) {
        const c = state.cards[id];
        c.lapses++;
        c.ease = Math.max(1.3, c.ease - 0.2);
      }
      session.failed.add(id);
      // No escape: the word comes back a few cards later until you get it right.
      session.queue.splice(Math.min(3, session.queue.length), 0, { id, type: pickType(id, type) });
      session.total++;
    }
    save();
    speak(BY_ID[id].h);
    render();
  }

  function finishSession() {
    const cards = Object.keys(session.need).length;
    lastSummary = { mode: session.mode, cards, clean: cards - session.failed.size };
    session = null;
    if (lastSummary.mode === 'daily') checkComplete();
    view = 'summary';
    render();
  }

  // ---------- placement test ----------

  // Words are ordered easiest-first, so we test a couple from each block of the list.
  // Both right → the whole block counts as known. Two blocks in a row with nothing
  // right → stop, you've found your level.
  function startTest() {
    const blocks = [];
    for (let i = 0; i < WORDS.length; i += TEST_BLOCK) {
      blocks.push(shuffle(WORDS.slice(i, i + TEST_BLOCK).map((w) => w.h)).slice(0, TEST_PER_BLOCK));
    }
    test = { blocks, block: 0, q: 0, right: [], misses: 0, known: new Set(), asked: 0, current: null };
    nextTestQuestion();
  }

  function nextTestQuestion() {
    const id = test.blocks[test.block][test.q];
    test.current = { id, options: buildOptions(id, 'meaning') };
    render();
  }

  function testAnswer(givenId) {
    const id = test.current.id;
    test.asked++;
    if (givenId === id) test.right.push(id);
    test.q++;
    const block = test.blocks[test.block];
    if (test.q < block.length) return nextTestQuestion();

    if (test.right.length === block.length) {
      const start = test.block * TEST_BLOCK;
      WORDS.slice(start, start + TEST_BLOCK).forEach((w) => test.known.add(w.h));
    } else {
      test.right.forEach((h) => test.known.add(h));
    }
    test.misses = test.right.length ? 0 : test.misses + 1;
    test.block++;
    test.q = 0;
    test.right = [];
    if (test.misses >= 2 || test.block >= test.blocks.length) return finishTest();
    nextTestQuestion();
  }

  function finishTest() {
    let added = 0;
    for (const id of test.known) {
      if (state.cards[id]) continue;
      // Count it as learned, but due back within a week so reviews confirm it.
      state.cards[id] = { interval: 3, ease: 2.5, due: addDays(today(), 1 + Math.floor(Math.random() * 7)), reps: 1, lapses: 0 };
      added++;
    }
    state.placement = { date: today(), known: test.known.size };
    save();
    testResult = { known: test.known.size, added, asked: test.asked, nextWord: unlearnedIds()[0] };
    test = null;
    view = 'testResult';
    render();
  }

  // ---------- rendering ----------

  function render() {
    if (session) return renderSession();
    if (test) return renderTest();
    if (view === 'testResult') return renderTestResult();
    if (view === 'settings') return renderSettings();
    if (view === 'summary') return renderSummary();
    renderHome();
  }

  function header() {
    const s = streak();
    return `
      <header class="top">
        <button class="brand" data-action="home">汉字 <span>Every Day</span></button>
        <div class="streak ${s ? '' : 'cold'}" title="Day streak">🔥 ${s}</div>
      </header>`;
  }

  function continueLink() {
    if (iosGate) return `<a class="btn primary" href="${UNLOCK_SHORTCUT}">Unlock my apps for today</a>`;
    if (!fromUrl) return '';
    let host = fromUrl;
    try {
      host = new URL(fromUrl).hostname;
    } catch {
      return '';
    }
    return `<a class="btn ghost" href="${esc(fromUrl)}">Continue to ${esc(host)} →</a>`;
  }

  function calendar() {
    const days = new Set(state.completedDays);
    const t = today();
    let cells = '';
    for (let i = 27; i >= 0; i--) {
      const d = addDays(t, -i);
      const cls = days.has(d) ? 'on' : d === t ? 'today' : '';
      cells += `<span class="day ${cls}" title="${d}"></span>`;
    }
    return `<div class="cal">${cells}</div>`;
  }

  function statsBlock() {
    const learned = Object.keys(state.cards).length;
    const mastered = Object.values(state.cards).filter((c) => c.interval >= 21).length;
    const acc = state.stats.answered ? Math.round((100 * state.stats.correct) / state.stats.answered) : 0;
    return `
      <div class="stats">
        <div><b>${learned}</b><span>words seen</span></div>
        <div><b>${mastered}</b><span>mastered</span></div>
        <div><b>${acc}%</b><span>accuracy</span></div>
        <div><b>${WORDS.length - learned}</b><span>to go</span></div>
      </div>
      <p class="label">Last 4 weeks</p>
      ${calendar()}`;
  }

  function renderHome() {
    checkComplete();
    const done = isDoneToday(state);
    const r = remainingToday();
    const lost = lostStreak();
    let main;
    if (done) {
      main = `
        <section class="card ok">
          <div class="big">✓</div>
          <h1>Today's lesson is done.</h1>
          <p>Come back tomorrow. Your words will be waiting.</p>
          <div class="row">
            ${continueLink()}
            ${Object.keys(state.cards).length ? '<button class="btn ghost" data-action="practice">Extra practice</button>' : ''}
          </div>
        </section>`;
    } else {
      const parts = [];
      if (r.reviews) parts.push(`<b>${r.reviews}</b> review${r.reviews === 1 ? '' : 's'}`);
      if (r.fresh) parts.push(`<b>${r.fresh}</b> new word${r.fresh === 1 ? '' : 's'}`);
      main = `
        <section class="card owe">
          ${iosGate ? '<p class="blocked">Your apps are locked until you finish today\'s Chinese.</p>' : ''}
          ${fromUrl ? `<p class="blocked">Blocked. You don't get <b>${esc(safeHost(fromUrl))}</b> until you finish today's Chinese.</p>` : ''}
          ${lost ? `<p class="shame">Your ${lost}-day streak is dead. Start a new one.</p>` : ''}
          <h1>You owe today's lesson.</h1>
          <p class="owed">${parts.join(' + ')}</p>
          <button class="btn primary" data-action="start">Start lesson</button>
        </section>`;
    }
    const offer = state.placement
      ? ''
      : `<section class="card offer">
          <h2>Know some Chinese already?</h2>
          <p>Take a 2-minute placement test and skip the words you know.</p>
          <div class="row">
            <button class="btn primary" data-action="test">Take the test</button>
            <button class="btn ghost" data-action="skipTest">I'm a total beginner</button>
          </div>
        </section>`;
    $app.innerHTML = `${header()}<main>${offer}${main}${statsBlock()}</main>
      <footer><button class="link" data-action="settings">Settings</button></footer>`;
  }

  function safeHost(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  function freqBadge(w) {
    const f = FREQ[w.f] || FREQ[1];
    return `<span class="freq f${w.f}" title="How often this word is used in everyday Chinese">${f.dots} ${f.label}</span>`;
  }

  function usageNote(w) {
    return w.n ? `<p class="note">${esc(w.n)}</p>` : '';
  }

  function wordReveal(w) {
    return `
      <div class="reveal">
        <div class="hanzi sm">${w.h}</div>
        <div>
          <div class="pinyin">${esc(w.p)}</div>
          <div class="meaning">${esc(w.m)}</div>
          ${freqBadge(w)}
        </div>
        ${canSpeak() ? `<button class="icon" data-action="speak" data-text="${esc(w.h)}" aria-label="Play">🔊</button>` : ''}
      </div>
      ${usageNote(w)}`;
  }

  function renderSession() {
    const { id, type, options } = session.current;
    const w = BY_ID[id];
    const a = session.answer;
    const pct = Math.round((100 * session.done) / Math.max(1, session.total));
    let body = '';

    if (type === 'intro') {
      body = `
        <p class="label">New word</p>
        <div class="hanzi">${w.h}</div>
        <div class="pinyin lg">${esc(w.p)}</div>
        <div class="meaning lg">${esc(w.m)}</div>
        <div>${freqBadge(w)}</div>
        ${usageNote(w)}
        ${canSpeak() ? `<button class="btn ghost" data-action="speak" data-text="${esc(w.h)}">🔊 Hear it</button>` : ''}
        <button class="btn primary" data-action="next">Got it</button>`;
    } else if (type === 'pinyin') {
      body = `
        <p class="label">Type the pinyin</p>
        <div class="hanzi">${w.h}</div>
        <div class="meaning">${esc(w.m)}</div>
        <form data-form="pinyin" class="pin">
          <input id="pin" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
            placeholder="e.g. ni3 hao3" ${a ? 'disabled' : ''} value="${a ? esc(a.given) : ''}">
          ${a ? '' : '<button class="btn primary">Check</button>'}
        </form>
        <p class="hint">Use tone numbers 1–4 after each syllable (or tone marks). Tones count.</p>`;
    } else {
      let prompt;
      if (type === 'meaning') prompt = `<p class="label">What does this mean?</p><div class="hanzi">${w.h}</div>`;
      else if (type === 'hanzi') prompt = `<p class="label">Which one means…</p><div class="meaning xl">${esc(w.m)}</div>`;
      else
        prompt = `<p class="label">Which one did you hear?</p>
          <button class="btn speaker" data-action="speak" data-text="${esc(w.h)}">🔊</button>`;
      const opts = options
        .map((o, i) => {
          let cls = '';
          if (a) {
            if (o === w) cls = 'right';
            else if (o.h === a.given) cls = 'wrong';
          }
          const label = type === 'meaning' ? esc(o.m) : `<span class="hanzi opt">${o.h}</span>`;
          return `<button class="opt-btn ${cls}" data-action="choose" data-id="${esc(o.h)}" ${a ? 'disabled' : ''}>
            <kbd>${i + 1}</kbd>${label}</button>`;
        })
        .join('');
      body = `${prompt}<div class="opts ${type === 'meaning' ? '' : 'grid'}">${opts}</div>`;
    }

    const feedback = a
      ? `<div class="feedback ${a.correct ? 'good' : 'bad'}">
          <p class="verdict">${a.correct ? 'Correct' : 'Wrong — this one comes back until you get it.'}</p>
          ${wordReveal(w)}
          <button class="btn primary" data-action="next" id="cont">Continue</button>
        </div>`
      : '';

    $app.innerHTML = `
      ${header()}
      <div class="progress"><div style="width:${pct}%"></div></div>
      <main class="lesson">${body}${feedback}</main>`;

    const input = document.getElementById('pin');
    if (input && !a) input.focus();
    const cont = document.getElementById('cont');
    if (cont) cont.focus();
  }

  function renderTest() {
    const { id, options } = test.current;
    const w = BY_ID[id];
    const totalQ = test.blocks.length * TEST_PER_BLOCK;
    const pct = Math.round((100 * (test.block * TEST_PER_BLOCK + test.q)) / totalQ);
    const opts = options
      .map(
        (o, i) => `<button class="opt-btn" data-action="testChoose" data-id="${esc(o.h)}"><kbd>${i + 1}</kbd>${esc(o.m)}</button>`
      )
      .join('');
    $app.innerHTML = `
      ${header()}
      <div class="progress"><div style="width:${pct}%"></div></div>
      <main class="lesson">
        <p class="label">Placement test · don't guess</p>
        <div class="hanzi">${w.h}</div>
        <div class="opts">${opts}
          <button class="opt-btn idk" data-action="testChoose" data-id=""><kbd>5</kbd>I don't know</button>
        </div>
        <p class="hint">The test gets harder as you go and stops when you reach your level.</p>
      </main>`;
  }

  function renderTestResult() {
    const r = testResult;
    const next = r.nextWord ? BY_ID[r.nextWord] : null;
    $app.innerHTML = `${header()}<main>
      <section class="card ok">
        <div class="big">${r.known ? '🎯' : '🌱'}</div>
        <h1>${r.known ? `You already know about ${r.known} words` : 'Starting from the beginning'}</h1>
        <p>${
          r.known
            ? `${r.added} of them were added to your reviews. They'll come back over the next week to confirm you really know them.`
            : 'No problem. Everyone starts somewhere. Your first lesson begins with the basics.'
        }</p>
        ${next ? `<p>Your new words start at <b class="hanzi-inline">${next.h}</b> (${esc(next.m)}).</p>` : ''}
        <button class="btn primary" data-action="home">Go to today's lesson</button>
      </section></main>`;
  }

  function renderSummary() {
    const s = lastSummary;
    const done = isDoneToday(state);
    $app.innerHTML = `${header()}<main>
      <section class="card ok">
        <div class="big">${s.mode === 'daily' && done ? '🎉' : '✓'}</div>
        <h1>${s.mode === 'daily' ? (done ? 'Lesson complete' : 'Session complete') : 'Practice complete'}</h1>
        <p>${s.clean} of ${s.cards} words right on the first try.</p>
        ${s.mode === 'daily' && done ? `<p>Streak: <b>${streak()}</b> day${streak() === 1 ? '' : 's'}.</p>` : ''}
        <div class="row">
          ${done ? continueLink() : ''}
          <button class="btn ghost" data-action="home">Home</button>
        </div>
      </section></main>`;
  }

  function renderSettings() {
    const done = isDoneToday(state);
    $app.innerHTML = `${header()}<main>
      <section class="card">
        <h1>Settings</h1>
        <form data-form="settings" class="settings">
          <label>New words per day
            <input type="number" name="newPerDay" min="${MIN_NEW_PER_DAY}" max="30" value="${state.settings.newPerDay}">
            <small>Minimum ${MIN_NEW_PER_DAY}. Nice try.</small>
          </label>
          <label>Blocked sites (one per line)
            <textarea name="blocklist" rows="8" ${done ? '' : 'disabled'}>${esc(state.settings.blocklist.join('\n'))}</textarea>
            <small>${
              done
                ? IS_EXT
                  ? 'These sites redirect here until each day’s lesson is done.'
                  : 'Blocking only works when this is installed as a browser extension (see README).'
                : 'Locked until you finish today’s lesson.'
            }</small>
          </label>
          <button class="btn primary">Save</button>
        </form>
        <hr>
        <h2>Placement test</h2>
        <p>${state.placement && state.placement.date ? `Last taken ${state.placement.date}. ` : ''}Retaking only adds words you know. It never removes progress.</p>
        <button class="btn ghost" data-action="test">${state.placement && state.placement.date ? 'Retake' : 'Take'} the placement test</button>
        <hr>
        <h2>Pronunciation</h2>
        <p>${canSpeak() ? `Using voice: ${esc(zhVoice.name)}` : 'No Chinese voice found on this device, so listening exercises are off. Install a Chinese (zh-CN) text-to-speech voice in your OS settings.'}</p>
        ${canSpeak() ? '<button class="btn ghost" data-action="speak" data-text="你好，我们开始学习汉语吧">🔊 Test voice</button>' : ''}
        <hr>
        <h2>Reset all progress</h2>
        <p>Type <b>${GIVE_UP_PHRASE}</b> (“I give up”) in Chinese characters or pinyin with tones to wipe everything.</p>
        <form data-form="reset" class="pin">
          <input name="phrase" autocomplete="off" placeholder="${GIVE_UP_PHRASE}">
          <button class="btn danger">Reset</button>
        </form>
      </section></main>`;
  }

  // ---------- events ----------

  const actions = {
    home() {
      view = 'home';
      render();
    },
    settings() {
      view = 'settings';
      render();
    },
    start: startDaily,
    test: startTest,
    skipTest() {
      state.placement = { skipped: true };
      save();
      render();
    },
    testChoose(el) {
      if (test) testAnswer(el.dataset.id);
    },
    practice: startPractice,
    next,
    speak(el) {
      speak(el.dataset.text);
    },
    choose(el) {
      if (!session || session.answer) return;
      answer(el.dataset.id === session.current.id, el.dataset.id);
    },
  };

  $app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    e.preventDefault();
    actions[el.dataset.action](el);
  });

  $app.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const kind = form.dataset.form;
    if (kind === 'pinyin') {
      if (!session || session.answer) return;
      const given = form.querySelector('input').value.trim();
      if (!given) return;
      answer(pinyinKey(given) === pinyinKey(BY_ID[session.current.id].p), given);
    } else if (kind === 'settings') {
      const data = new FormData(form);
      const n = Math.round(Number(data.get('newPerDay')));
      state.settings.newPerDay = Math.min(30, Math.max(MIN_NEW_PER_DAY, n || MIN_NEW_PER_DAY));
      if (isDoneToday(state) && data.has('blocklist')) {
        state.settings.blocklist = String(data.get('blocklist'))
          .split('\n')
          .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
          .filter(Boolean);
      }
      save();
      view = 'home';
      render();
    } else if (kind === 'reset') {
      const phrase = String(new FormData(form).get('phrase')).trim();
      if (phrase === GIVE_UP_PHRASE || pinyinKey(phrase) === pinyinKey('wǒ fàng qì')) {
        state = defaultState();
        save();
        view = 'home';
        render();
      } else {
        form.querySelector('input').value = '';
        form.querySelector('input').placeholder = 'Wrong. Keep studying instead.';
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (test && /^[1-5]$/.test(e.key)) {
      const btn = $app.querySelectorAll('[data-action="testChoose"]')[Number(e.key) - 1];
      if (btn) btn.click();
      return;
    }
    if (!session) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (!session.answer && /^[1-4]$/.test(e.key) && tag !== 'INPUT') {
      const btn = $app.querySelectorAll('[data-action="choose"]')[Number(e.key) - 1];
      if (btn) btn.click();
    } else if (e.key === 'Enter' && (session.answer || session.current.type === 'intro') && tag !== 'BUTTON') {
      e.preventDefault();
      next();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (session && session.mode === 'daily') {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  if (IS_EXT) {
    // Another tab may finish the lesson; keep this one in sync when idle.
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.state && !session) {
        state = Object.assign(defaultState(), changes.state.newValue || {});
        render();
      }
    });
  }

  if (!IS_EXT && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  load().then(render);
})();
