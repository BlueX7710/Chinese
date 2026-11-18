# 汉字 Every Day

A Chinese app that makes you learn: your distracting apps and websites stay blocked until you've done today's lesson.

**Open it:** https://bluex7710.github.io/Chinese/

## What it does

- **Daily lesson you can't skip**: new words plus spaced-repetition reviews of old ones (5 new words a day by default, never fewer than 3). There's no skip button: get a word wrong and it comes back a few cards later, in a different exercise, until you get it right.
- **Exercises**: a new-word card (characters, pinyin, meaning and audio), characters → meaning, meaning → characters, listening (hear it, pick the characters) and typing the pinyin with tones (`ni3 hao3`; tones count). Keys `1`–`4` answer and `Enter` continues. Every question has an **I don't know** button: it shows the answer without a telling-off and brings the word back later, so there's no reason to guess.
- **Ready for HSK 2?**: a tracker on the Learn and Progress tabs that tells you when you've outgrown HSK 1. It has three goals: learn all 150 words, have 120 of them solid (recalled after a week or more), and score 80%+ on a mock test in the last two weeks. When all three are met you get a celebration and a badge.
- **Talk tab**: 10 everyday conversations (meeting someone, ordering food, shopping, asking the way, phone calls, the weather, family, making plans and more), mostly in HSK 1 words. Read them as chat bubbles with pinyin and English you can hide, tap a line to hear it, or **Practise**: you play one side and pick what to say at each turn. A different conversation is featured each day.
- **What's my HSK level?**: on the **Test** tab, a 5-minute test that climbs from HSK 1 to HSK 6 (6 words per level, 5 right to pass) and stops when the words get too hard. It tells you your vocabulary level, and HSK 1 words you get right are skipped in the lessons. Words for HSK 2–6 are samples from the classic 6-level word lists (`docs/levels.js`); lessons still teach HSK 1.
- **Skip words you already know**: each new word first shows just the characters and asks if you know it. Tap **I already know it** and answer one quick check: get it right and the word is skipped (it comes back in a week to make sure) and a different new word takes its place, so your daily quota stays honest. Get it wrong and you learn it as normal.
- **HSK 1 mock test**: on the **Test** tab, 20 or 40 questions drawn from the whole HSK 1 list (including words you haven't learned), half listening and half reading, timed, with no answers until the end. You get a score per section, a pass or fail at the real exam's 60% mark, and the list of words you missed. It checks vocabulary only (the real exam also uses sentences) and doesn't count as the daily lesson.
- **Five tabs**: Learn (today's lesson, this week, HSK 2 readiness), Talk (conversations), Test (level test, mock test and placement test), Progress (readiness checklist, level, stats, calendar, badges) and Settings.
- **Blocking**: the **Android app** sends Instagram, TikTok, YouTube or any app you pick to your lesson until it's done, then a button takes you back. The **Chrome extension** does the same for websites. On **iPhone**, a Shortcuts automation does it (see below). The block list can only be changed after that day's lesson.
- **Placement test**: on first launch, a 2-minute test (or "I'm a total beginner"). It asks two words from each block of 15, gets harder as it goes and stops at your level. Words you know skip the beginner lessons but come back in reviews over the next week to make sure. Retake it any time in Settings; it only ever adds words.
- **How common each word is**: every word shows ●●● *Very common*, ●●○ *Common* or ●○○ *Less common*, from how often it appears in Chinese film and TV subtitles ([OpenSubtitles frequency list](https://github.com/hermitdave/FrequencyWords)). 23 words also have a usage note when the textbook word isn't what people say, e.g. 汉语 → people usually say 中文.
- **Vocabulary**: all 150 HSK 1 words, in a beginner-friendly order.
- **Fun on purpose**: Bao the panda greets you in Chinese, cheers when you're right and encourages you when you're not. Right answers earn XP, with a bonus for several in a row, and you level up through Chinese titles (新手 Newcomer → 学生 Student → … → 龙 Dragon). There are 15 badges to collect, sound effects (can be turned off in Settings) and confetti when you finish. Praise comes in real Chinese phrases like 太棒了! and 加油!, so even the feedback teaches.
- **Streaks**: a day streak and a 4-week calendar. Miss a day and Bao tells you he missed you and your streak restarts. The Android app also sends a 7 pm reminder.
- **Giving up takes effort**: resetting your progress means typing 我放弃 ("I give up") in Chinese.

Progress is stored only on your own device, separately for each app and browser.

## Install

- **Android app**: download `Hanzi-Every-Day.apk` from [Releases](../../releases/latest), open it on your phone and allow the install (if Play Protect warns you: **More details → Install anyway**). Then open the app and follow the two steps on the home screen to turn on the app blocker: allow **Usage access**, then **Display over other apps**. If Android says **"Restricted setting"**, tap the link under the button for the steps (Settings → Apps → 汉字 Every Day → ⋮ → **Allow restricted settings**). The lessons update themselves: the app downloads new versions from this site in the background and still works offline. Only changes to the Android part itself (the blocker, reminders) need the newest APK installed over the old one. Uninstalling deletes your progress.
- **Any phone or computer**: open the link above (it always loads the newest version when you're online). Then tap the **Install app** button at the top (Chrome, Edge, Android), or on iPhone/iPad follow the hint at the bottom: **Share → Add to Home Screen** in Safari. On an Android phone the site also links to the Android app.
- **Computer (Chrome, Edge, Brave)**: open the link above and click **Install app** to get it in its own window. To block websites, download `Hanzi-Every-Day-Chrome.zip` from [Releases](../../releases/latest) and unzip it, open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder. The extension keeps its own copy of your progress, so do your daily lesson there. It can't update itself (Chrome doesn't allow that for manually loaded extensions): to update, download the new zip, replace the folder and click reload on the extensions page.

### Making an iPhone block apps (optional, ~5 minutes)

A web app can't block other apps, but the iPhone's **Shortcuts** app can. Do your lessons in **Safari** for this, because Safari and the home-screen app keep separate progress.

1. **Unlock shortcut.** Shortcuts → **+** → name it exactly `Hanzi Unlock`. Add **Current Date** → **Format Date** (custom format `yyyy-MM-dd`) → **Save File** to `Shortcuts/hanzi-done.txt` (**Overwrite If File Exists** on, **Ask Where to Save** off).
2. **Gate shortcut.** A new shortcut named `Hanzi Gate`: **Get File** `Shortcuts/hanzi-done.txt` ("Error If Not Found" off) → **Current Date** → **Format Date** (`yyyy-MM-dd`) → **If** *File* **is not** *Formatted Date* → **Open URLs** `https://bluex7710.github.io/Chinese/index.html?gate=ios` → **End If**.
3. **Trigger.** Automation → **+** → **App** → pick Instagram, TikTok, YouTube etc. → **Is Opened** → **Run Immediately** → **Run Shortcut** `Hanzi Gate`.
4. **Daily nag (optional).** Automation → **Time of Day** (e.g. 7 pm) → **Open URLs** with the same link.

Opening a locked app now sends you to the lesson. When you finish, tap **Unlock my apps for today** and they open normally until midnight.

## Repository layout

| Folder | What's in it |
| --- | --- |
| `docs/` | The web app, served by GitHub Pages: `index.html`, `app.js`, `fun.js` (mascot, sounds, confetti), `words.js` (the vocabulary), `styles.css`, the manifest, offline service worker and icons. It's also the Chrome extension (`manifest.json`, `background.js`). |
| `android-app/` | The Android app: a WebView around `docs/` (copied in at build time) plus the app blocker, reminder and Chinese voice in Java. The blocker uses usage access and display-over-other-apps, not an accessibility service, because Play Protect refuses to install sideloaded apps that have one. |
| `.github/workflows/` | `android.yml` builds the APK and zips the Chrome extension on every push to `main`, and publishes both to Releases. |
| `tools/` | `smoke.js` tests the app in a browser (lesson, placement test, phone layout and the Android flow). |
| `index.html` | Forwards to `docs/`, in case GitHub Pages serves the repository root. |
| `.claude/skills/effortless/` | The `/effortless` Claude Code skill: test, commit, push and ship in one go. |

## Building the Android app

GitHub Actions builds it on every push to `main`. To build locally you need JDK 17, Gradle 8.9 and the Android SDK (platform 34):

```bash
gradle -p android-app assembleRelease   # output: android-app/app/build/outputs/apk/release/app-release.apk
```

Builds are signed with the key in the `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD` repository secrets, so each new APK installs over the last one. Without them the build uses a throwaway key. The key is never stored in the repo.
