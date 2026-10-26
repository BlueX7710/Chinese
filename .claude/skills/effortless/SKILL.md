---
name: effortless
description: Ship a 汉字 Every Day change everywhere in one go. Smoke-tests the website in a browser, commits and pushes, and checks the Android build. Use when the user says /effortless, "ship it", "sync and publish", or asks to push a change live.
---

# Ship a 汉字 Every Day change

There is one copy of the lesson code, in `docs/`, and three ways it reaches people:

| Copy | Comes from | Goes live by |
| --- | --- | --- |
| Website | `docs/` | a push to `main` (GitHub Pages serves `docs/`) |
| Android app | `docs/` copied into `android-app/` at build time | the same push: `.github/workflows/android.yml` builds the APK and publishes it to Releases |
| Chrome extension | `docs/` (loaded unpacked) | the user clicks reload on `chrome://extensions` |

## Steps

1. **Cache.** If you changed anything in `docs/`, bump `CACHE` in `docs/sw.js` so installed copies update.

2. **Test.** Serve `docs/` and run the smoke test. It must print `OK`:
   ```bash
   npx serve -l 5180 docs &
   node tools/smoke.js http://localhost:5180/
   ```
   If Playwright isn't found, set `PLAYWRIGHT_PATH` to its folder (in Claude Code cloud sessions:
   `/opt/node-tools/node_modules/playwright`). Also test whatever the change itself touches, at
   desktop and phone width. Don't go on while anything fails.

3. **README.** If a feature was added or changed, update the "What it does" list in `README.md`
   and "Where things stand" in `CLAUDE.md`.

4. **Commit and push.** Write a commit message that says what changed for the user. Push to the
   branch you were told to work on. If that isn't `main`, tell the user the website and app update
   only once it reaches `main`, and offer to merge or open a pull request. Don't merge without asking.

5. **Android build.** After a push to `main`, check the "Android app" workflow run. If it fails,
   read the log, fix and push again.

6. **Report** in a few lines: what shipped, where it's live now, and anything still waiting
   (a merge to `main`, or the user reinstalling the APK if Java code changed).
