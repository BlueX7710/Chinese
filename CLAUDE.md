# 汉字 Every Day: notes for Claude

A Chinese (HSK 1) learning app that blocks your distracting apps and sites until today's lesson is
done. It runs as a website, an Android app and a Chrome extension. It's the owner's own project;
`README.md` lists everything it does.

## How the code is laid out

- `docs/` is the website and the only copy of the lesson code: `index.html`, `app.js` (all app
  logic, no framework, no build step), `words.js` (vocabulary), `styles.css`, `shared.js` (helpers
  shared with the extension). GitHub Pages serves `docs/` from `main`.
- `docs/` is also the Chrome extension: `manifest.json` and `background.js` (redirects blocked sites).
- `android-app/` wraps `docs/` in a WebView. Gradle copies the web files into the APK at build
  time, so there's nothing to sync by hand. The Java side, exposed to JavaScript as
  `window.HanziNative`, adds Chinese text-to-speech (Android's WebView has no `speechSynthesis`),
  the installed-app list, and `lessonDone(date)`. `BlockerService` is an accessibility service that
  redirects blocked apps; `ReminderReceiver` sends the 7 pm reminder.
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
- The "forcing" rules are features, not bugs: no skip button, minimum 3 new words a day, the block
  list locked until the lesson is done, reset only by typing 我放弃.
- If you change `docs/sw.js` or any file it caches, bump `CACHE` so installed apps update.
- The Android signing key lives only in the repository secrets. Never commit a keystore or its password.

## Where things stand (October 2026)

- Website, placement test, frequency labels, Chrome extension and Android app are all built.
  `tools/smoke.js` passes.
- Never tested on real hardware: the Android app (blocker, reminder, voice) and the iPhone
  Shortcuts setup.
- The owner still needs to add the `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD` secrets
  before installing the APK, or updates will need an uninstall.
- Ideas not done yet: HSK 2 words, example sentences, moving progress between devices.
