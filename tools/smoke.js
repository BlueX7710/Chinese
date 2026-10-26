// Smoke test: opens 汉字 Every Day in Chromium, does a full daily lesson (with one wrong answer),
// takes the placement test, checks the phone layout has no sideways scroll, and runs the Android
// app's flow against a fake native bridge. Fails on any page error.
//   npx serve -l 5180 docs &
//   node tools/smoke.js http://localhost:5180/
// Needs Playwright: set PLAYWRIGHT_PATH to its folder if `require('playwright')` can't find it.
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// Use the folder address: `serve` redirects index.html to a clean URL and drops the query string.
const url = (process.argv[2] || 'http://localhost:5180/').replace(/\/?$/, '/');

const TONE = { ā: 'a1', á: 'a2', ǎ: 'a3', à: 'a4', ē: 'e1', é: 'e2', ě: 'e3', è: 'e4', ī: 'i1', í: 'i2', ǐ: 'i3', ì: 'i4',
  ō: 'o1', ó: 'o2', ǒ: 'o3', ò: 'o4', ū: 'u1', ú: 'u2', ǔ: 'u3', ù: 'u4', ǚ: 'v3' };
// "nǐ hǎo" -> "ni3hao3", the way a learner would type it.
const numbered = (p) => p.split(' ').map((s) => {
  let t = '';
  const base = [...s].map((c) => (TONE[c] ? ((t = TONE[c][1]), TONE[c][0]) : c)).join('');
  return base + t;
}).join('');

// A fake window.HanziNative, standing in for the Android app's Java bridge.
function fakeAndroid() {
  const calls = (window.__calls = []);
  let blocked = ['com.instagram.android', 'com.google.android.youtube'];
  let on = false;
  window.HanziNative = {
    hasVoice: () => true,
    speak: () => {},
    lessonDone: (d) => calls.push('done:' + d),
    getApps: () => JSON.stringify([
      { pkg: 'com.instagram.android', label: 'Instagram' },
      { pkg: 'com.google.android.youtube', label: 'YouTube' },
      { pkg: 'com.whatsapp', label: 'WhatsApp' },
    ]),
    getBlockedApps: () => JSON.stringify(blocked),
    setBlockedApps: (j) => { blocked = JSON.parse(j); calls.push('blocked:' + blocked.join(',')); },
    isBlockerOn: () => on,
    openBlockerSettings: () => { on = true; },
    openAppSettings: () => {},
    openApp: (p) => calls.push('open:' + p),
  };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const fail = (msg) => errors.push(msg);

  async function open(opts, init) {
    const ctx = await browser.newContext(opts);
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => fail(e.message));
    p.on('dialog', (d) => d.accept());
    return p;
  }

  // Answers whatever exercise is on screen. Gets the first multiple-choice question wrong on purpose.
  async function doLesson(p) {
    let wrongDone = false;
    for (let i = 0; i < 120; i++) {
      if (await p.$('.card.ok')) return;
      if (await p.$('#cont')) { await p.click('#cont'); continue; }
      const label = await p.textContent('.lesson .label');
      if (label.startsWith('New word')) { await p.click('[data-action=next]'); continue; }
      if (label.startsWith('Type the pinyin')) {
        const h = await p.textContent('.lesson .hanzi');
        const py = await p.evaluate((h) => WORDS.find((w) => w.h === h).p, h);
        await p.fill('#pin', numbered(py));
        await p.press('#pin', 'Enter');
        continue;
      }
      const correct = label.startsWith('What does')
        ? await p.textContent('.lesson .hanzi')
        : await p.evaluate((m) => WORDS.find((w) => w.m === m).h, await p.textContent('.meaning.xl'));
      const ids = await p.$$eval('[data-action=choose]', (b) => b.map((x) => x.dataset.id));
      const pick = wrongDone ? correct : ids.find((id) => id !== correct);
      wrongDone = true;
      await p.click(`[data-action=choose][data-id="${pick}"]`);
    }
    fail('lesson did not finish');
  }

  // 1. Desktop: full daily lesson.
  let p = await open({ viewport: { width: 1280, height: 900 } });
  await p.goto(url);
  await p.click('[data-action=skipTest]');
  await p.click('[data-action=start]');
  await doLesson(p);
  const summary = await p.textContent('main');
  if (!/Lesson complete/.test(summary)) fail('daily lesson did not complete: ' + summary.replace(/\s+/g, ' '));
  if (!/4 of 5 words right/.test(summary)) fail('wrong answer was not counted: ' + summary.replace(/\s+/g, ' '));
  await p.click('[data-action=home]');
  if (!/Today's lesson is done/.test(await p.textContent('main'))) fail('home does not show the lesson as done');

  // 2. Phone: placement test for someone who knows exactly the first 60 words.
  p = await open({ ...devices['iPhone 13'] });
  await p.goto(url);
  await p.click('[data-action=test]');
  while (await p.$('[data-action=testChoose]')) {
    const h = await p.textContent('.lesson .hanzi');
    const idx = await p.evaluate((h) => WORDS.findIndex((w) => w.h === h), h);
    await p.click(idx < 60 ? `[data-action=testChoose][data-id="${h}"]` : '.idk');
  }
  const known = await p.evaluate(() => Object.keys(JSON.parse(localStorage.state).cards).length);
  if (known !== 60) fail(`placement test marked ${known} words known, expected 60`);
  await p.click('[data-action=home]');
  if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail('phone layout scrolls sideways');
  await p.click('[data-action=start]');
  const first = await p.textContent('.lesson .hanzi');
  if (first !== '买') fail(`first new word after placement is ${first}, expected 买 (word 61)`);
  if (!(await p.$('.freq'))) fail('new word card has no frequency label');

  // 3. Android app: blocked-app screen, lesson, then back to the blocked app and edit the block list.
  p = await open({ ...devices['Pixel 7'] }, fakeAndroid);
  await p.goto(url + '?app=com.instagram.android&appName=Instagram');
  if (!(await p.$('.card.warn'))) fail('Android: no "app blocker is off" warning');
  if (!/You don't get Instagram/.test(await p.textContent('main'))) fail('Android: blocked app not named');
  await p.click('[data-action=blockerSettings]');
  await p.evaluate(() => onNativeResume());
  if (await p.$('.card.warn')) fail('Android: blocker warning still showing after turning it on');
  await p.click('[data-action=skipTest]');
  await p.click('[data-action=start]');
  await doLesson(p);
  await p.click('[data-action=openApp]');
  await p.click('[data-action=home]');
  await p.click('[data-action=settings]');
  await p.uncheck('input[value="com.google.android.youtube"]');
  await p.check('input[value="com.whatsapp"]');
  await p.click('form[data-form=settings] .btn.primary');
  const calls = await p.evaluate(() => window.__calls);
  if (!calls.some((c) => c.startsWith('done:'))) fail('Android: lesson completion not reported to the app');
  if (!calls.includes('open:com.instagram.android')) fail('Android: "Continue to Instagram" did not open it');
  if (!calls.includes('blocked:com.instagram.android,com.whatsapp')) fail('Android: block list not saved');

  await browser.close();
  if (errors.length) {
    console.error('FAILED\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  console.log('OK');
})();
