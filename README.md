# 汉字 Every Day

An app that **forces** you to learn Chinese. You get your distracting websites back only after you finish today's lesson.

## How it forces you

- **Site blocker (Chrome extension).** YouTube, Reddit, X, Instagram, TikTok, Netflix and others redirect to your lesson until it's done for the day.
- **Opens itself.** Every time the browser starts and the lesson isn't done, the lesson is the first tab you see. The toolbar icon shows a red `!` until you finish.
- **No skipping.** There's no skip button. A wrong answer brings the word back a few cards later, in a different exercise, until you get it right.
- **The blocklist is locked** until you've finished today's lesson, so you can't remove YouTube when you're feeling weak.
- **Minimum 3 new words a day.** You can't set it to zero.
- **Streak shaming.** Miss a day and the home screen tells you your streak is dead.
- **Giving up takes effort.** To reset your progress you have to type 我放弃 ("I give up") in Chinese.

## What you learn

All 150 HSK 1 words, taught in a sensible beginner order, with spaced repetition. Words you know well come back less often; words you miss come back tomorrow.

Exercise types:
- New word card (characters, pinyin, meaning, audio)
- Characters → meaning (multiple choice)
- Meaning → characters (multiple choice)
- Listening: hear it, pick the characters (needs a Chinese text-to-speech voice on your device)
- Type the pinyin with tones, e.g. `ni3 hao3` (tones count)

Keyboard: `1`–`4` to answer multiple choice, `Enter` to continue.

## Install

### As a Chrome extension (recommended — this is what does the forcing)

1. Download this repo (Code → Download ZIP, then unzip), or `git clone` it.
2. Open `chrome://extensions` in Chrome, Edge, Brave or Arc.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick this folder.
5. The lesson opens right away. Click the red 汉 icon in the toolbar to open it any time.

Edit the blocked sites in **Settings** (after finishing that day's lesson).

### As a plain web page

Open `index.html` in any browser, or host the folder on GitHub Pages. You get the lessons and streaks, but no site blocking. Progress is stored in that browser's local storage.

## Audio

Pronunciation uses your system's text-to-speech. If you hear nothing, install a Chinese (zh-CN) voice:
- **Windows:** Settings → Time & language → Speech → Add voices → Chinese (Simplified)
- **macOS:** System Settings → Accessibility → Spoken Content → System voice → Manage voices → Chinese
- **Android/iOS:** usually already installed

## Files

| File | What it is |
|---|---|
| `index.html`, `app.js`, `styles.css` | The lesson app |
| `words.js` | HSK 1 vocabulary — add more words here |
| `shared.js` | Helpers shared by the app and the extension |
| `manifest.json`, `background.js` | The Chrome extension (site blocker, badge, opens on startup) |
