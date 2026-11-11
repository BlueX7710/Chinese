(() => {
  'use strict';

  const WORDS = window.WORDS;
  const BY_ID = Object.fromEntries(WORDS.map((w) => [w.h, w]));
  const IS_EXT = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
  // Set when running inside the Android app (see android/). Provides speech and app blocking.
  const NATIVE = window.HanziNative || null;
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
  // Android: the app you tried to open when the blocker sent you here.
  let blockedApp = params.get('app') ? { pkg: params.get('app'), name: params.get('appName') || params.get('app') } : null;
  const UNLOCK_SHORTCUT = 'shortcuts://run-shortcut?name=' + encodeURIComponent('Hanzi Unlock');

  let state;
  let session = null; // active lesson, or null on the home/settings screens
  let test = null; // active placement test
  let testResult = null;
  let exam = null; // active HSK mock test
  let examTimer = null;
  let examResult = null;
  const busy = () => !!(session || test || exam); // mid-lesson or mid-test: don't redraw underneath
  let barPct = 0; // where the lesson progress bar last stood, so it can animate

  // Installing: Chrome/Edge/Android fire beforeinstallprompt; iPhone Safari needs the Share sheet.
  const APK_URL = 'https://github.com/BlueX7710/Chinese/releases/latest/download/Hanzi-Every-Day.apk';
  const UA = navigator.userAgent;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const inBrowser = !NATIVE && !IS_EXT && !standalone;
  const isIOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS/.test(UA);
  const isAndroid = /Android/.test(UA);
  const isDesktop = !isAndroid && !isIOS;
  const isChromium = /Chrome|Chromium|Edg\//.test(UA);
  const EXTENSION_URL = 'https://github.com/BlueX7710/Chinese/releases/latest/download/Hanzi-Every-Day-Chrome.zip';
  let installEvt = null;
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
      settings: { newPerDay: 5, blocklist: [...DEFAULT_BLOCKLIST], sound: true },
      stats: { answered: 0, correct: 0 },
      placement: null, // set once the placement test is taken or skipped
      xp: 0,
      bestCombo: 0,
      perfectLessons: 0,
      badges: {}, // badge id -> date earned
      exams: [], // last HSK mock tests: { date, score, max, passed }
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
    // Progress from before XP existed still counts.
    if (saved && saved.xp === undefined) state.xp = state.stats.correct * 10;
    awardBadges();
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

  const canSpeak = () => (NATIVE ? NATIVE.hasVoice() : !!zhVoice);
  const voiceName = () => (NATIVE ? 'Android text-to-speech (Chinese)' : zhVoice.name);

  function speak(text) {
    if (!canSpeak()) return;
    if (NATIVE) return NATIVE.speak(text);
    const u = new SpeechSynthesisUtterance(text);
    u.voice = zhVoice;
    u.lang = zhVoice.lang;
    u.rate = 0.8;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ---------- XP, levels and badges ----------

  const play = (name) => state.settings.sound && Fun.sound(name);

  // Level titles double as vocabulary: [from level, hanzi, pinyin, meaning]
  const LEVEL_TITLES = [
    [1, '新手', 'xīnshǒu', 'Newcomer'],
    [2, '学生', 'xuésheng', 'Student'],
    [4, '读者', 'dúzhě', 'Reader'],
    [7, '高手', 'gāoshǒu', 'Ace'],
    [10, '大师', 'dàshī', 'Master'],
    [15, '龙', 'lóng', 'Dragon'],
  ];
  const xpForLevel = (n) => 50 * n * (n - 1); // total XP to reach level n: 0, 100, 300, 600, 1000…

  function levelInfo(xp = state.xp) {
    let n = 1;
    while (xpForLevel(n + 1) <= xp) n++;
    const [, h, p, m] = [...LEVEL_TITLES].reverse().find((t) => n >= t[0]);
    return { n, h, p, m, into: xp - xpForLevel(n), span: xpForLevel(n + 1) - xpForLevel(n) };
  }

  // Things Bao says when you get one right. Real phrases, so they teach too.
  const PRAISE = [
    ['太棒了!', 'tài bàng le', 'Awesome!'],
    ['很好!', 'hěn hǎo', 'Very good!'],
    ['对了!', 'duì le', "That's right!"],
    ['真棒!', 'zhēn bàng', 'Great job!'],
    ['厉害!', 'lì hai', 'Impressive!'],
    ['没错!', 'méi cuò', 'Exactly!'],
  ];

  function bestStreak() {
    const days = [...new Set(state.completedDays)].sort();
    let best = 0;
    let run = 0;
    days.forEach((d, i) => {
      run = i && addDays(days[i - 1], 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
    });
    return best;
  }

  const wordsSeen = () => Object.keys(state.cards).length;
  const wordsMastered = () => Object.values(state.cards).filter((c) => c.interval >= 21).length;

  const BADGES = [
    { id: 'first', icon: '🌱', name: 'First steps', how: 'Finish your first lesson', test: () => state.completedDays.length >= 1 },
    { id: 'streak3', icon: '🔥', name: '3-day streak', how: 'Study 3 days in a row', test: () => bestStreak() >= 3 },
    { id: 'streak7', icon: '⚡', name: 'Full week', how: 'Study 7 days in a row', test: () => bestStreak() >= 7 },
    { id: 'streak30', icon: '🏆', name: '30-day streak', how: 'Study 30 days in a row', test: () => bestStreak() >= 30 },
    { id: 'perfect', icon: '💯', name: 'Perfect lesson', how: 'Finish a lesson with no mistakes', test: () => state.perfectLessons >= 1 },
    { id: 'combo10', icon: '🎯', name: 'On fire', how: 'Get 10 right in a row', test: () => state.bestCombo >= 10 },
    { id: 'words10', icon: '📗', name: '10 words', how: 'Learn 10 words', test: () => wordsSeen() >= 10 },
    { id: 'words50', icon: '📚', name: '50 words', how: 'Learn 50 words', test: () => wordsSeen() >= 50 },
    { id: 'words100', icon: '🎓', name: '100 words', how: 'Learn 100 words', test: () => wordsSeen() >= 100 },
    { id: 'master10', icon: '🧠', name: 'Long memory', how: 'Master 10 words', test: () => wordsMastered() >= 10 },
    { id: 'hskpass', icon: '📝', name: 'HSK ready', how: 'Pass an HSK 1 mock test', test: () => state.exams.some((e) => e.passed) },
    { id: 'hsk1', icon: '🐉', name: 'HSK 1 hero', how: `Learn all ${WORDS.length} words`, test: () => wordsSeen() >= WORDS.length },
  ];

  // Marks newly earned badges and returns them.
  function awardBadges() {
    const fresh = BADGES.filter((b) => !state.badges[b.id] && b.test());
    fresh.forEach((b) => (state.badges[b.id] = today()));
    return fresh;
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
    // Length of the streak that ended before yesterday, if any, so Bao can say he missed you.
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
    session = {
      mode, queue, need, failed: new Set(), total: queue.length, done: 0, current: null, answer: null,
      combo: 0, xp: 0, startLevel: levelInfo().n,
    };
    barPct = 0;
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

  // `skipped` means the learner tapped "I don't know": wrong for scheduling, but no scolding.
  function answer(correct, given, skipped = false) {
    const { id, type } = session.current;
    session.answer = { correct, given, skipped };
    session.done++;
    state.stats.answered++;
    if (correct) state.stats.correct++;

    if (correct) {
      session.need[id]--;
      if (session.need[id] <= 0 && session.mode === 'daily') schedule(id, !session.failed.has(id));
      // XP: 10 per right answer, plus a little extra for each one in a row (up to +10).
      session.combo++;
      state.bestCombo = Math.max(state.bestCombo, session.combo);
      const gain = 10 + Math.min(session.combo - 1, 5) * 2;
      const before = levelInfo().n;
      state.xp += gain;
      session.xp += gain;
      Object.assign(session.answer, { gain, combo: session.combo, praise: pick(PRAISE) });
      if (levelInfo().n > before) session.answer.levelUp = levelInfo();
      play(session.answer.levelUp ? 'level' : 'correct');
    } else {
      session.combo = 0;
      if (!skipped) play('wrong');
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
    const perfect = session.failed.size === 0 && cards >= 3;
    let bonus = 0;
    let justCompleted = false;
    if (session.mode === 'daily') {
      const wasDone = isDoneToday(state);
      checkComplete();
      justCompleted = !wasDone && isDoneToday(state);
      if (justCompleted) bonus += 50;
      if (perfect) {
        bonus += 25;
        state.perfectLessons++;
      }
    }
    state.xp += bonus;
    const level = levelInfo();
    lastSummary = {
      mode: session.mode, cards, clean: cards - session.failed.size, perfect, justCompleted,
      xp: session.xp + bonus, levelUp: level.n > session.startLevel ? level : null, badges: awardBadges(),
    };
    session = null;
    save();
    view = 'summary';
    render();
    if (justCompleted || lastSummary.mode === 'practice') {
      play('complete');
      Fun.confetti();
    }
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

  // ---------- HSK mock test ----------

  const EXAM_SECONDS_PER_QUESTION = 30;
  const EXAM_PASS = 0.6; // the real HSK 1 passes at 120 of 200

  const clock = (ms) => {
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  // Words come from the whole list, learned or not. Half listening, half reading when the
  // device has a Chinese voice; reading only when it doesn't.
  function startExam(count) {
    const listening = canSpeak() ? count / 2 : 0;
    const questions = shuffle(WORDS)
      .slice(0, count)
      .map((w, i) => {
        const section = i < listening ? 'listening' : 'reading';
        const type = section === 'listening' ? pick(['listenMeaning', 'listen']) : pick(['meaning', 'hanzi', 'pinyinPick']);
        // buildOptions('listen') picks words that sound different, which is what pinyin choices need too.
        const optionsLike = type === 'listenMeaning' ? 'meaning' : type === 'pinyinPick' ? 'listen' : type;
        return { id: w.h, section, type, options: buildOptions(w.h, optionsLike), given: null };
      });
    exam = { questions, i: 0, ends: Date.now() + count * EXAM_SECONDS_PER_QUESTION * 1000 };
    clearInterval(examTimer);
    examTimer = setInterval(tickExam, 500);
    showExamQuestion();
  }

  function showExamQuestion() {
    const q = exam.questions[exam.i];
    if (q.section === 'listening') speak(q.id);
    render();
  }

  function tickExam() {
    if (!exam) return clearInterval(examTimer);
    const left = Math.max(0, exam.ends - Date.now());
    const el = document.getElementById('clock');
    if (el) el.textContent = clock(left);
    if (!left) finishExam();
  }

  function examAnswer(givenId) {
    exam.questions[exam.i].given = givenId;
    exam.i++;
    if (exam.i >= exam.questions.length) return finishExam();
    showExamQuestion();
  }

  function finishExam() {
    clearInterval(examTimer);
    const sections = {};
    for (const q of exam.questions) {
      const sec = sections[q.section] || (sections[q.section] = { right: 0, total: 0 });
      sec.total++;
      if (q.given === q.id) sec.right++;
    }
    // Like the real HSK, each section is worth 100 points. Unanswered questions score nothing.
    let score = 0;
    let max = 0;
    for (const sec of Object.values(sections)) {
      sec.score = Math.round((100 * sec.right) / sec.total);
      score += sec.score;
      max += 100;
    }
    const missed = exam.questions.filter((q) => q.given !== q.id).map((q) => q.id);
    const xp = (exam.questions.length - missed.length) * 5;
    const passed = score >= EXAM_PASS * max;
    state.xp += xp;
    state.exams = [...state.exams, { date: today(), score, max, passed }].slice(-10);
    examResult = { sections, score, max, passed, xp, missed, timedOut: exam.i < exam.questions.length, badges: awardBadges() };
    exam = null;
    save();
    view = 'examResult';
    render();
    if (passed) {
      play('complete');
      Fun.confetti();
    }
  }

  // ---------- rendering ----------

  function render() {
    if (NATIVE && isDoneToday(state)) NATIVE.lessonDone(today());
    if (session) return renderSession();
    if (test) return renderTest();
    if (exam) return renderExam();
    if (view === 'testResult') return renderTestResult();
    if (view === 'exam') return renderExamIntro();
    if (view === 'examResult') return renderExamResult();
    if (view === 'progress') return renderProgress();
    if (view === 'settings') return renderSettings();
    if (view === 'summary') return renderSummary();
    renderHome();
  }

  function header() {
    const s = streak();
    return `
      <header class="top">
        <button class="brand" data-action="home">汉字 <span>Every Day</span></button>
        <div class="top-right">
          ${installEvt ? '<button class="btn install" data-action="install">Install app</button>' : ''}
          <div class="xp-chip" title="${state.xp} XP">⭐ Lv ${levelInfo().n}</div>
          <div class="streak ${s ? '' : 'cold'}" title="Day streak">🔥 ${s}</div>
        </div>
      </header>`;
  }

  const ICONS = {
    home: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    exam: '<path d="M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m9 13 2 2 4-5"/>',
    progress: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  };
  const TABS = [['home', 'Learn'], ['exam', 'Test'], ['progress', 'Progress'], ['settings', 'Settings']];

  // The bottom tab bar. Hidden during lessons and tests so there's nothing to wander off to.
  function nav() {
    const here = view === 'examResult' ? 'exam' : view === 'summary' || view === 'testResult' ? 'home' : view;
    const tabs = TABS.map(
      ([id, label]) => `<button class="${here === id ? 'on' : ''}" data-action="go" data-view="${id}">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id]}</svg>
        <span>${label}</span>${id === 'home' && !isDoneToday(state) ? '<i class="dot"></i>' : ''}
      </button>`
    ).join('');
    return `<nav class="tabs"><div>${tabs}</div></nav>`;
  }

  // Monday to Sunday of this week, labelled the Chinese way: 一 二 三 四 五 六 日.
  function weekStrip() {
    const t = today();
    const dow = (new Date().getDay() + 6) % 7;
    const days = new Set(state.completedDays);
    const cells = ['一', '二', '三', '四', '五', '六', '日']
      .map((name, i) => {
        const d = addDays(t, i - dow);
        const cls = days.has(d) ? 'done' : d === t ? 'now' : i > dow ? 'later' : 'missed';
        return `<div class="wd ${cls}" title="${d}">${days.has(d) ? '✓' : name}</div>`;
      })
      .join('');
    const s = streak();
    return `<section class="week">
        <div class="week-head"><b>This week</b><span>${s ? `🔥 ${s}-day streak` : 'Start a streak today'}</span></div>
        <div class="week-days">${cells}</div>
      </section>`;
  }

  function continueLink() {
    if (blockedApp) return `<button class="btn primary" data-action="openApp">Continue to ${esc(blockedApp.name)} →</button>`;
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

  function levelCard() {
    const l = levelInfo();
    return `
      <section class="level">
        <div class="lv-num">Lv ${l.n}</div>
        <div class="lv-body">
          <div class="lv-title"><b class="hanzi-inline">${l.h}</b> ${esc(l.p)} · ${esc(l.m)}</div>
          <div class="bar"><div style="width:${Math.round((100 * l.into) / l.span)}%"></div></div>
          <small>${l.into} / ${l.span} XP to level ${l.n + 1}</small>
        </div>
      </section>`;
  }

  function badgeTile(b) {
    const on = !!state.badges[b.id];
    return `<button class="badge ${on ? 'on' : ''}" data-action="badge" data-id="${b.id}">
      <span>${on ? b.icon : '🔒'}</span><small>${esc(b.name)}</small></button>`;
  }

  function badgesBlock() {
    const earned = BADGES.filter((b) => state.badges[b.id]).length;
    return `<p class="label">Badges · ${earned} of ${BADGES.length}</p>
      <div class="badges">${BADGES.map(badgeTile).join('')}</div>`;
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12
      ? ['早上好!', 'zǎoshang hǎo', 'Good morning!']
      : h < 18
        ? ['下午好!', 'xiàwǔ hǎo', 'Good afternoon!']
        : ['晚上好!', 'wǎnshang hǎo', 'Good evening!'];
  }

  // Bao with a speech bubble. `zh` is an optional [hanzi, pinyin, meaning] line he says first.
  function bao(mood, zh, text) {
    return `<div class="bao">
        ${Fun.panda(mood, 88)}
        <div class="bubble">
          ${zh ? `<b class="hanzi-inline">${zh[0]}</b> <small>${esc(zh[1])} · ${esc(zh[2])}</small><br>` : ''}${text}
        </div>
      </div>`;
  }

  function statsBlock() {
    const learned = wordsSeen();
    const mastered = wordsMastered();
    const acc = state.stats.answered ? Math.round((100 * state.stats.correct) / state.stats.answered) : 0;
    return `
      ${levelCard()}
      <div class="stats">
        <div><b>${learned}</b><span>words seen</span></div>
        <div><b>${mastered}</b><span>mastered</span></div>
        <div><b>${acc}%</b><span>accuracy</span></div>
        <div><b>${WORDS.length - learned}</b><span>to go</span></div>
      </div>
      <p class="label">Last 4 weeks</p>
      ${calendar()}
      ${badgesBlock()}`;
  }

  function renderHome() {
    checkComplete();
    const done = isDoneToday(state);
    const r = remainingToday();
    const lost = lostStreak();
    let main;
    if (done) {
      main = `
        <section class="card ok hero done">
          ${bao('love', ['明天见!', 'míngtiān jiàn', 'See you tomorrow!'], 'You did it. Go enjoy your day.')}
          <h1>Today's lesson is done.</h1>
          <p>${streak() > 1 ? `That's ${streak()} days in a row. ` : ''}Your words will be waiting tomorrow.</p>
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
        <section class="card owe hero">
          ${iosGate ? '<p class="blocked">🔒 Your apps unlock as soon as you finish today\'s Chinese.</p>' : ''}
          ${blockedApp ? `<p class="blocked">🔒 <b>${esc(blockedApp.name)}</b> is locked until you finish today's Chinese. It only takes a few minutes!</p>` : ''}
          ${fromUrl ? `<p class="blocked">🔒 <b>${esc(safeHost(fromUrl))}</b> is locked until you finish today's Chinese. It only takes a few minutes!</p>` : ''}
          ${
            lost
              ? bao('sad', null, `Your ${lost}-day streak ended. I missed you! Let's start a new one today.`)
              : bao('happy', greeting(), streak() ? `Day ${streak() + 1} of your streak starts now.` : 'Ready when you are.')
          }
          <h1>Time for today's Chinese!</h1>
          <p class="owed">${parts.join(' + ')}</p>
          <button class="btn primary big-btn" data-action="start">Start lesson</button>
        </section>`;
    }
    // The blocker needs two Android permissions, granted one at a time.
    const needs = NATIVE && !NATIVE.isBlockerOn() ? (NATIVE.blockerNeeds ? NATIVE.blockerNeeds() : 'usage') : '';
    const blockerOff =
      needs
        ? `<section class="card warn">
            <h2>Turn on the app blocker · step ${needs === 'overlay' ? 2 : 1} of 2</h2>
            <p>${
              needs === 'overlay'
                ? 'Last step: allow <b>Display over other apps</b>, so your lesson can pop up in front of a blocked app.'
                : 'Allow <b>Usage access</b> so the app can tell when you open Instagram, TikTok or YouTube. Find <b>汉字 Every Day</b> in the list and switch it on.'
            }</p>
            <button class="btn primary" data-action="blockerSettings">Open the setting</button>
            <button class="link" data-action="blockerHelp">It says "restricted setting"?</button>
          </section>`
        : '';
    const offer = state.placement
      ? ''
      : `<section class="card offer">
          <h2>Know some Chinese already?</h2>
          <p>A 2-minute placement test lets you skip the words you know.</p>
          <div class="row">
            <button class="btn primary" data-action="test">Take the test</button>
            <button class="btn ghost" data-action="skipTest">I'm a total beginner</button>
          </div>
        </section>`;
    $app.innerHTML = `${header()}<main>${blockerOff}${main}${offer}${weekStrip()}${levelCard()}${installHelp()}</main>${nav()}`;
  }

  function renderProgress() {
    const best = state.exams.reduce((b, e) => (!b || e.score / e.max > b.score / b.max ? e : b), null);
    $app.innerHTML = `${header()}<main>
      <h1 class="page-title">Progress</h1>
      ${statsBlock()}
      ${best ? `<p class="label">HSK 1 mock test</p><section class="card slim">Best score <b>${best.score} / ${best.max}</b> ${best.passed ? '· passed ✓' : '· not passed yet'}</section>` : ''}
    </main>${nav()}`;
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
    const idk = a ? '' : '<button type="button" class="link idk-link" data-action="dontKnow">I don\'t know</button>';
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
        <p class="hint">Use tone numbers 1–4 after each syllable (or tone marks). Tones count.</p>
        ${idk}`;
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
      body = `${prompt}<div class="opts ${type === 'meaning' ? '' : 'grid'}">${opts}</div>${idk}`;
    }

    const verdict = a
      ? a.correct
        ? `<p class="verdict"><span class="hanzi-inline">${a.praise[0]}</span> <small>${esc(a.praise[1])} · ${esc(a.praise[2])}</small></p>
           <p class="gain"><span>⭐ +${a.gain} XP</span>${a.combo >= 2 ? `<span class="combo">🔥 ${a.combo} in a row</span>` : ''}</p>
           ${a.levelUp ? `<p class="levelup">Level up! You're now Lv ${a.levelUp.n} · ${a.levelUp.h} (${esc(a.levelUp.m)})</p>` : ''}`
        : a.skipped
          ? `<p class="verdict"><span class="hanzi-inline">没关系!</span> <small>méi guānxi · No worries!</small></p>
             <p class="gain">Here's the answer. It comes back later so you can learn it.</p>`
          : `<p class="verdict"><span class="hanzi-inline">加油!</span> <small>jiā yóu · Keep going!</small></p>
             <p class="gain">Not quite. This one comes back until you've got it.</p>`
      : '';
    const feedback = a
      ? `<div class="feedback ${a.correct ? 'good' : 'bad'}">
          <div class="fb-head"><div>${verdict}</div>${Fun.panda(a.correct ? 'cheer' : a.skipped ? 'happy' : 'sad', 60)}</div>
          ${wordReveal(w)}
          <button class="btn primary" data-action="next" id="cont">Continue</button>
        </div>`
      : '';

    $app.innerHTML = `
      ${header()}
      <div class="progress"><div id="bar" style="width:${barPct}%"></div></div>
      <main class="lesson ${a ? '' : 'enter'}">${body}${feedback}</main>`;

    // Start the bar where it was and let it glide to the new value.
    const bar = document.getElementById('bar');
    requestAnimationFrame(() => (bar.style.width = pct + '%'));
    barPct = pct;

    const input = document.getElementById('pin');
    if (input && !a) input.focus();
    const cont = document.getElementById('cont');
    if (cont) cont.focus();
  }

  function installHelp() {
    if (!inBrowser) return '';
    const parts = [];
    if (isAndroid) {
      parts.push(`<a class="btn ghost" href="${APK_URL}">Get the Android app</a>
        <small>The app version can block Instagram, TikTok and other apps until you've studied.</small>`);
    } else if (isIOSSafari) {
      parts.push('<p class="install-hint">To install: tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>');
    } else if (isIOS) {
      parts.push('<p class="install-hint">To install, open this page in <b>Safari</b>, tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>');
    } else if (isDesktop) {
      parts.push(`<details class="desk">
          <summary>Block YouTube, Reddit and other sites on this computer</summary>
          ${
            isChromium
              ? `<ol>
                  <li><a href="${EXTENSION_URL}">Download the extension</a> and unzip it (right-click → <b>Extract All</b> on Windows).</li>
                  <li>Open <code>chrome://extensions</code> (or <code>edge://extensions</code>) in a new tab.</li>
                  <li>Turn on <b>Developer mode</b>, click <b>Load unpacked</b> and pick the unzipped folder.</li>
                </ol>
                <small>The extension has its own copy of your lessons, so start your streak there.</small>`
              : '<small>The website blocker is a Chrome extension. Open this page in Chrome, Edge or Brave to get it.</small>'
          }
        </details>`);
    }
    return parts.length ? `<div class="install-box">${parts.join('')}</div>` : '';
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

  function renderExamIntro() {
    const history = [...state.exams].reverse();
    $app.innerHTML = `${header()}<main>
      <h1 class="page-title">Test yourself</h1>
      <section class="card">
        <div class="card-head">${Fun.panda('happy', 64)}<div><h2>HSK 1 mock test</h2>
          <p>Words from the whole HSK 1 list, including ones you haven't learned yet. No hints, and no answers until the end.</p></div></div>
        <ul class="facts">
          <li>${canSpeak() ? 'Half listening, half reading' : 'Reading only (this device has no Chinese voice)'}</li>
          <li>${EXAM_SECONDS_PER_QUESTION} seconds per question on average</li>
          <li>Pass mark ${EXAM_PASS * 100}%, like the real exam</li>
        </ul>
        <div class="row">
          <button class="btn primary" data-action="exam" data-count="20">Quick test · 20 questions</button>
          <button class="btn ghost" data-action="exam" data-count="40">Full test · 40 questions</button>
        </div>
        <small class="fine">The real HSK 1 also uses short sentences. This checks how well you know the words, and doesn't count as your daily lesson.</small>
      </section>
      ${
        history.length
          ? `<p class="label">Your results</p><section class="card list">${history
              .map((e) => `<div class="list-row"><span>${e.date}</span><b>${e.score} / ${e.max}</b><span class="${e.passed ? 'pass' : 'fail'}">${e.passed ? 'Passed' : 'Not yet'}</span></div>`)
              .join('')}</section>`
          : ''
      }
      <p class="label">Placement test</p>
      <section class="card">
        <p>${state.placement && state.placement.date ? `Last taken ${state.placement.date}. ` : ''}Already know some words? This finds your level and skips the ones you know. It only ever adds words.</p>
        <button class="btn ghost" data-action="test">${state.placement && state.placement.date ? 'Retake' : 'Take'} the placement test</button>
      </section>
    </main>${nav()}`;
  }

  const EXAM_PROMPTS = {
    listenMeaning: 'Listening · What does it mean?',
    listen: 'Listening · Which one did you hear?',
    meaning: 'Reading · What does this mean?',
    hanzi: 'Reading · Which one means…',
    pinyinPick: 'Reading · How do you say this?',
  };

  function renderExam() {
    const q = exam.questions[exam.i];
    const w = BY_ID[q.id];
    const total = exam.questions.length;
    const shows = q.section === 'listening'
      ? `<button class="btn speaker" data-action="speak" data-text="${esc(w.h)}">🔊</button>`
      : q.type === 'hanzi'
        ? `<div class="meaning xl">${esc(w.m)}</div>`
        : `<div class="hanzi">${w.h}</div>`;
    const label = (o) =>
      q.type === 'meaning' || q.type === 'listenMeaning'
        ? esc(o.m)
        : q.type === 'pinyinPick'
          ? `<span class="pinyin lg">${esc(o.p)}</span>`
          : `<span class="hanzi opt">${o.h}</span>`;
    const opts = q.options
      .map((o, i) => `<button class="opt-btn" data-action="examChoose" data-id="${esc(o.h)}"><kbd>${i + 1}</kbd>${label(o)}</button>`)
      .join('');
    $app.innerHTML = `
      ${header()}
      <div class="exam-bar"><span>Question ${exam.i + 1} of ${total}</span><span class="clock">⏱ <b id="clock">${clock(exam.ends - Date.now())}</b></span></div>
      <div class="progress"><div style="width:${Math.round((100 * exam.i) / total)}%"></div></div>
      <main class="lesson enter">
        <p class="label">${EXAM_PROMPTS[q.type]}</p>
        ${shows}
        <div class="opts ${q.type === 'hanzi' || q.type === 'listen' ? 'grid' : ''}">${opts}</div>
        <button class="link idk-link" data-action="examChoose" data-id="">I don't know</button>
      </main>`;
  }

  function renderExamResult() {
    const r = examResult;
    const rows = Object.entries(r.sections)
      .map(([name, sec]) => `<div class="list-row"><span>${name === 'listening' ? '🎧 Listening' : '📖 Reading'}</span><span>${sec.right} of ${sec.total} right</span><b>${sec.score} / 100</b></div>`)
      .join('');
    const missed = r.missed
      .map((id) => BY_ID[id])
      .map((w) => `<div class="list-row"><b class="hanzi-inline">${w.h}</b><span class="pinyin">${esc(w.p)}</span><span>${esc(w.m)}</span></div>`)
      .join('');
    $app.innerHTML = `${header()}<main>
      <section class="card ok celebrate">
        ${Fun.panda(r.passed ? 'love' : 'happy', 112)}
        <p class="praise">${r.passed ? '<b class="hanzi-inline">通过了!</b> <small>tōngguò le · You passed!</small>' : '<b class="hanzi-inline">加油!</b> <small>jiā yóu · Keep going!</small>'}</p>
        <h1 class="score">${r.score} <small>/ ${r.max}</small></h1>
        <p>${r.passed ? 'That would pass.' : `Not yet. The pass mark is ${EXAM_PASS * r.max}.`}${r.timedOut ? ' Time ran out before the last questions.' : ''}</p>
        <div class="chips"><span>⭐ +${r.xp} XP</span></div>
        ${r.badges.map((b) => `<p class="new-badge"><span>${b.icon}</span> New badge: <b>${esc(b.name)}</b></p>`).join('')}
        <div class="row">
          <button class="btn primary" data-action="go" data-view="exam">Try again</button>
          <button class="btn ghost" data-action="home">Home</button>
        </div>
      </section>
      <p class="label">By section</p>
      <section class="card list">${rows}</section>
      ${missed ? `<p class="label">Words to work on · ${r.missed.length}</p><section class="card list words">${missed}</section>` : ''}
    </main>${nav()}`;
  }

  function renderTestResult() {
    const r = testResult;
    const next = r.nextWord ? BY_ID[r.nextWord] : null;
    $app.innerHTML = `${header()}<main>
      <section class="card ok">
        ${Fun.panda(r.known ? 'cheer' : 'happy', 104)}
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
    const title = s.mode === 'daily' ? (done ? 'Lesson complete' : 'Session complete') : 'Practice complete';
    const chips = [`<span>⭐ +${s.xp} XP</span>`];
    if (s.mode === 'daily' && done) chips.push(`<span>🔥 ${streak()}-day streak</span>`);
    if (s.perfect) chips.push('<span>💯 Perfect</span>');
    $app.innerHTML = `${header()}<main>
      <section class="card ok celebrate">
        ${Fun.panda(s.clean === s.cards ? 'love' : 'cheer', 120)}
        <p class="praise"><b class="hanzi-inline">太棒了!</b> <small>tài bàng le · Awesome!</small></p>
        <h1>${title}</h1>
        <p>${s.clean} of ${s.cards} words right on the first try.</p>
        <div class="chips">${chips.join('')}</div>
        ${s.levelUp ? `<p class="levelup">Level up! You're now Lv ${s.levelUp.n} · ${s.levelUp.h} (${esc(s.levelUp.p)}, ${esc(s.levelUp.m)})</p>` : ''}
        ${s.badges.map((b) => `<p class="new-badge"><span>${b.icon}</span> New badge: <b>${esc(b.name)}</b></p>`).join('')}
        <div class="row">
          ${done ? continueLink() : ''}
          <button class="btn ghost" data-action="home">Home</button>
        </div>
      </section>
      ${levelCard()}</main>${nav()}`;
  }

  function appPicker(done) {
    const blocked = new Set(JSON.parse(NATIVE.getBlockedApps()));
    const apps = JSON.parse(NATIVE.getApps()).sort((a, b) => blocked.has(b.pkg) - blocked.has(a.pkg));
    const rows = apps
      .map(
        (a) => `<label class="app"><input type="checkbox" name="app" value="${esc(a.pkg)}" ${blocked.has(a.pkg) ? 'checked' : ''}>
          ${esc(a.label)}</label>`
      )
      .join('');
    return `<fieldset class="apps" ${done ? '' : 'disabled'}>
        <legend>Blocked apps</legend>
        <small>${
          done
            ? NATIVE.isBlockerOn()
              ? 'These apps send you to your lesson until each day’s lesson is done.'
              : 'The app blocker is off. Turn it on from the home screen.'
            : 'Locked until you finish today’s lesson.'
        }</small>
        <div class="app-list">${rows}</div>
      </fieldset>`;
  }

  function renderSettings() {
    const done = isDoneToday(state);
    $app.innerHTML = `${header()}<main>
      <h1 class="page-title">Settings</h1>
      <section class="card">
        <form data-form="settings" class="settings">
          <label>New words per day
            <input type="number" name="newPerDay" min="${MIN_NEW_PER_DAY}" max="30" value="${state.settings.newPerDay}">
            <small>Minimum ${MIN_NEW_PER_DAY}. Nice try.</small>
          </label>
          <label class="check"><input type="checkbox" name="sound" ${state.settings.sound ? 'checked' : ''}> Sound effects</label>
          ${NATIVE ? appPicker(done) : `<label>Blocked sites (one per line)
            <textarea name="blocklist" rows="8" ${done ? '' : 'disabled'}>${esc(state.settings.blocklist.join('\n'))}</textarea>
            <small>${
              done
                ? IS_EXT
                  ? 'These sites redirect here until each day’s lesson is done.'
                  : 'Blocking only works when this is installed as a browser extension (see README).'
                : 'Locked until you finish today’s lesson.'
            }</small>
          </label>`}
          <button class="btn primary">Save</button>
        </form>
        <hr>
        <h2>Pronunciation</h2>
        <p>${canSpeak() ? `Using voice: ${esc(voiceName())}` : 'No Chinese voice found on this device, so listening exercises are off. Install a Chinese (zh-CN) text-to-speech voice in your OS settings.'}</p>
        ${canSpeak() ? '<button class="btn ghost" data-action="speak" data-text="你好，我们开始学习汉语吧">🔊 Test voice</button>' : ''}
        <hr>
        <h2>Reset all progress</h2>
        <p>Type <b>${GIVE_UP_PHRASE}</b> (“I give up”) in Chinese characters or pinyin with tones to wipe everything.</p>
        <form data-form="reset" class="pin">
          <input name="phrase" autocomplete="off" placeholder="${GIVE_UP_PHRASE}">
          <button class="btn danger">Reset</button>
        </form>
      </section></main>${nav()}`;
  }

  // ---------- events ----------

  const actions = {
    home() {
      if (updateWaiting) return location.reload(); // a new version arrived mid-lesson
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
    go(el) {
      view = el.dataset.view;
      render();
      window.scrollTo(0, 0);
    },
    exam(el) {
      startExam(Number(el.dataset.count));
    },
    examChoose(el) {
      if (exam) examAnswer(el.dataset.id);
    },
    dontKnow() {
      if (session && !session.answer && session.current.type !== 'intro') answer(false, '', true);
    },
    practice: startPractice,
    badge(el) {
      const b = BADGES.find((x) => x.id === el.dataset.id);
      const on = state.badges[b.id];
      Fun.toast(`${on ? b.icon : '🔒'} <b>${esc(b.name)}</b> · ${esc(b.how)}${on ? ' ✓' : ''}`);
    },
    async install() {
      if (!installEvt) return;
      const evt = installEvt;
      installEvt = null;
      evt.prompt();
      try {
        await evt.userChoice;
      } catch {
        // The user closed the prompt; nothing to do.
      }
      render();
    },
    openApp() {
      if (blockedApp) NATIVE.openApp(blockedApp.pkg);
    },
    blockerSettings() {
      NATIVE.openBlockerSettings();
    },
    blockerHelp() {
      alert(
        'Some phones protect this setting for apps installed outside the Play Store.\n\n' +
          '1. On the next screen, tap ⋮ (top right) → "Allow restricted settings" and confirm.\n' +
          '2. Come back here and tap "Open the setting" again.\n' +
          '3. Switch it on for 汉字 Every Day.'
      );
      NATIVE.openAppSettings();
    },
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
      state.settings.sound = data.has('sound');
      if (NATIVE && isDoneToday(state)) NATIVE.setBlockedApps(JSON.stringify(data.getAll('app')));
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
    if (exam && /^[1-4]$/.test(e.key)) {
      const btn = $app.querySelectorAll('.opt-btn[data-action="examChoose"]')[Number(e.key) - 1];
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

  if (NATIVE) {
    // These can fire before saved progress has loaded, hence the state checks.
    window.onNativeVoice = () => state && render();
    window.onNativeResume = () => {
      if (state && !busy()) render();
    };
    window.onNativeBlocked = (pkg, name) => {
      blockedApp = { pkg, name };
      if (state && !busy()) {
        view = 'home';
        render();
      }
    };
  }

  if (inBrowser) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installEvt = e;
      if (state && !busy()) render();
    });
    window.addEventListener('appinstalled', () => {
      installEvt = null;
      if (state && !busy()) render();
    });
  }

  // Reload into a new version as soon as it is ready, but never in the middle of a lesson or test.
  let updateWaiting = false;
  function applyUpdate() {
    updateWaiting = true;
    if (state && !busy()) location.reload();
  }
  if (NATIVE) window.onNativeUpdate = applyUpdate;

  if (!IS_EXT && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadWorker = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // A new service worker taking over means new files are cached. Not on the very first visit.
    navigator.serviceWorker.addEventListener('controllerchange', () => hadWorker && applyUpdate());
  }

  load().then(render);
})();
