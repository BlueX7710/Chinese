# 汉字 Every Day: notes for Claude

A Chinese (HSK 1) learning app that blocks your distracting apps and sites until today's lesson is
done. It runs as a website, an Android app and a Chrome extension. It's the owner's own project;
`README.md` lists everything it does.

## How the code is laid out

- `docs/` is the website and the only copy of the lesson code: `index.html`, `app.js` (all app
  logic, no framework, no build step), `words.js` (vocabulary), `styles.css`, `shared.js` (helpers
  shared with the extension). GitHub Pages serves `docs/` from `main`.
- `docs/fun.js` holds the cheerful layer (`window.Fun`): Bao the panda SVG, synthesized sound
  effects, confetti and toasts. XP, levels, combos and badges live in `app.js` and are saved in
  `state` (`xp`, `bestCombo`, `perfectLessons`, `badges`). A new web file must also be added to
  `FILES` in `docs/sw.js` and to `copyWeb` in `android-app/app/build.gradle`.
- `docs/` is also the Chrome extension: `manifest.json` and `background.js` (redirects blocked sites).
- `android-app/` wraps `docs/` in a WebView. Gradle copies the web files into the APK at build
  time, so there's nothing to sync by hand. The Java side, exposed to JavaScript as
  `window.HanziNative`, adds Chinese text-to-speech (Android's WebView has no `speechSynthesis`),
  the installed-app list, and `lessonDone(date)`. `WatchService` is a foreground service that
  polls usage access for the app in front and opens the lesson over blocked apps (needs "display
  over other apps"). It must not become an accessibility service: Play Protect refuses to install
  sideloaded apps that declare one. `ReminderReceiver` sends the 7 pm reminder.
- `app.js` checks `NATIVE` (Android), `IS_EXT` (extension) and `iosGate` (`?gate=ios`, iPhone
  Shortcuts) to switch behaviour. Everything else is shared.
- Files use LF line endings.
- To ship a change, use `/effortless` (`.claude/skills/effortless/SKILL.md`).

## Rules the code keeps

- Pinyin answers compare through `pinyinKey()` (letters plus tone sequence), so `ni3hao3`,
  `ni3 hao3` and `nǐ hǎo` all match. Neutral tone is ignored.
- Word frequency tiers (`f` in `words.js`) come from the OpenSubtitles list. Single characters it
  undercounts because of word segmentation (numbers, 几) are corrected by hand. Don't recompute
  them naively.
- The tone is cheerful, never shaming: wrong answers get 加油! and a sad Bao, not a scolding.
  All motion respects `prefers-reduced-motion`.
- The "forcing" rules are features, not bugs: no skip button, minimum 3 new words a day, the block
  list locked until the lesson is done, reset only by typing 我放弃.
- If you change `docs/sw.js` or any file it caches, bump `CACHE` so installed apps update. The
  Android app depends on this too: `Updater.java` reads the number in `CACHE` as the version and
  downloads the files in `FILES`, so every file the page loads must be listed there. The web app
  runs from a `www` folder in the app's storage (bundled copy first, then downloads), so a push to
  `main` reaches Android without a new APK. Only Java changes need a reinstall.
- The service worker is network-first: online, the newest files load on the first open.
- The Android signing key lives only in the repository secrets. Never commit a keystore or its password.

## Where things stand (October 2026)

- Website with four tabs (`view`: home, exam, progress, settings; the tab bar is hidden while
  `busy()`), HSK 1 mock test (`exam`, results in `state.exams`), "I don't know" on every question,
  placement test, frequency labels, XP/levels/badges with Bao the panda, Chrome extension
  and Android app are all built.
  `tools/smoke.js` passes.
- Never tested on real hardware: the Android app (blocker, reminder, voice) and the iPhone
  Shortcuts setup.
- The owner still needs to add the `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD` secrets
  before installing the APK, or updates will need an uninstall.
- Ideas not done yet: HSK 2 words, example sentences, moving progress between devices.
