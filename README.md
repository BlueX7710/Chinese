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

Open `index.html` in any browser. You get the lessons and streaks, but no site blocking. Progress is stored in that browser's local storage.

### On your phone (iPhone or Android)

The app installs to your home screen and works offline. Open **https://bluex7710.github.io/Chinese/** on your phone, then:

- **iPhone:** open the link in Safari → Share → **Add to Home Screen**.
- **Android:** open the link in Chrome → ⋮ menu → **Install app** (or **Add to Home screen**).

Your progress is stored on each device separately, so your phone and computer each keep their own streak.

#### Making your iPhone force you too (optional, ~5 minutes)

A web app can't block other apps by itself, but iPhone's built-in **Shortcuts** app can. Do your lessons in **Safari** for this (on iPhone, Safari and home-screen apps keep separate progress).

1. **Create the unlock shortcut.** Shortcuts → **+** → name it exactly `Hanzi Unlock`. Add these actions:
   - **Current Date** → **Format Date** (Custom format: `yyyy-MM-dd`)
   - **Save File** → save the formatted date to `Shortcuts/hanzi-done.txt`, with **Overwrite If File Exists** on and **Ask Where to Save** off.
2. **Create the gate shortcut.** New shortcut named `Hanzi Gate`:
   - **Get File** `Shortcuts/hanzi-done.txt` (turn off "Error If Not Found")
   - **Current Date** → **Format Date** (`yyyy-MM-dd`)
   - **If** *File* **is not** *Formatted Date* → **Open URLs** `https://bluex7710.github.io/Chinese/index.html?gate=ios` → **End If**
3. **Trigger it.** Automation tab → **+** → **App** → choose Instagram, TikTok, YouTube etc. → **Is Opened** → **Run Immediately** → action: **Run Shortcut** `Hanzi Gate`.
4. **(Optional) Daily nag.** Another automation → **Time of Day** (e.g. 7 pm) → **Open URLs** `https://bluex7710.github.io/Chinese/index.html?gate=ios`.

Now opening a locked app throws you into the lesson. When you finish, tap **Unlock my apps for today**. That runs `Hanzi Unlock`, and the locked apps open normally until midnight.

On **Android** there's no built-in equivalent. Use Digital Wellbeing app timers, or an automation app such as MacroDroid, to open the lesson link when a distracting app launches.

## Hosting

The app is plain static files, so any static host works:
- **GitHub Pages:** repo Settings → Pages → Source: *Deploy from a branch* → pick the branch and `/ (root)`. Your link will be `https://<username>.github.io/<repo>/`. (Free for public repos.)
- **Netlify:** drag this folder onto https://app.netlify.com/drop.

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
| `app.webmanifest`, `sw.js` | Phone install + offline support |
