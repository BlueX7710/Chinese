# 汉字 Every Day

A Chinese app that makes you learn: your distracting apps and websites stay blocked until you've done today's lesson.

**Open it:** https://bluex7710.github.io/Chinese/

## What it does

- **Daily lesson you can't skip**: new words plus spaced-repetition reviews of old ones (5 new words a day by default, never fewer than 3). There's no skip button: get a word wrong and it comes back a few cards later, in a different exercise, until you get it right.
- **Exercises**: a new-word card (characters, pinyin, meaning and audio), characters → meaning, meaning → characters, listening (hear it, pick the characters) and typing the pinyin with tones (`ni3 hao3`; tones count). Keys `1`–`4` answer and `Enter` continues.
- **Blocking**: the **Android app** sends Instagram, TikTok, YouTube or any app you pick to your lesson until it's done, then a button takes you back. The **Chrome extension** does the same for websites. On **iPhone**, a Shortcuts automation does it (see below). The block list can only be changed after that day's lesson.
- **Placement test**: on first launch, a 2-minute test (or "I'm a total beginner"). It asks two words from each block of 15, gets harder as it goes and stops at your level. Words you know skip the beginner lessons but come back in reviews over the next week to make sure. Retake it any time in Settings; it only ever adds words.
- **How common each word is**: every word shows ●●● *Very common*, ●●○ *Common* or ●○○ *Less common*, from how often it appears in Chinese film and TV subtitles ([OpenSubtitles frequency list](https://github.com/hermitdave/FrequencyWords)). 23 words also have a usage note when the textbook word isn't what people say, e.g. 汉语 → people usually say 中文.
- **Vocabulary**: all 150 HSK 1 words, in a beginner-friendly order.
- **Streaks**: a day streak, a 4-week calendar, and a message telling you your streak is dead when you miss a day. The Android app also sends a 7 pm reminder.
- **Giving up takes effort**: resetting your progress means typing 我放弃 ("I give up") in Chinese.

Progress is stored only on your own device, separately for each app and browser.

## Install

- **Android app**: download `Hanzi-Every-Day.apk` from [Releases](../../releases/latest), open it on your phone and allow the install (Play Protect may warn you: **More details → Install anyway**). Then open the app and tap **Turn on app blocker**. If Android says **"Restricted setting"**, tap the link under the button for the steps (Settings → Apps → 汉字 Every Day → ⋮ → **Allow restricted settings**). To update, install the newest APK over the old one; uninstalling deletes your progress.
- **Any phone or computer**: open the link above. Then tap the **Install app** button at the top (Chrome, Edge, Android), or on iPhone/iPad follow the hint at the bottom: **Share → Add to Home Screen** in Safari. On an Android phone the site also links to the Android app.
- **Chrome extension** (blocks websites): download this repo, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `docs` folder.

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
| `docs/` | The web app, served by GitHub Pages: `index.html`, `app.js`, `words.js` (the vocabulary), `styles.css`, the manifest, offline service worker and icons. It's also the Chrome extension (`manifest.json`, `background.js`). |
| `android-app/` | The Android app: a WebView around `docs/` (copied in at build time) plus the app blocker, reminder and Chinese voice in Java. |
| `.github/workflows/` | `android.yml` builds the APK on every push to `main` and publishes it to Releases. |
| `tools/` | `smoke.js` tests the app in a browser (lesson, placement test, phone layout and the Android flow). |
| `.claude/skills/effortless/` | The `/effortless` Claude Code skill: test, commit, push and ship in one go. |

## Building the Android app

GitHub Actions builds it on every push to `main`. To build locally you need JDK 17, Gradle 8.9 and the Android SDK (platform 34):

```bash
gradle -p android-app assembleRelease   # output: android-app/app/build/outputs/apk/release/app-release.apk
```

Builds are signed with the key in the `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD` repository secrets, so each new APK installs over the last one. Without them the build uses a throwaway key. The key is never stored in the repo.
