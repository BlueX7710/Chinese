importScripts('shared.js');

const LESSON_URL = chrome.runtime.getURL('index.html');

async function getState() {
  return (await chrome.storage.local.get('state')).state || null;
}

function openLesson() {
  chrome.tabs.create({ url: LESSON_URL });
}

async function updateBadge() {
  const done = isDoneToday(await getState());
  await chrome.action.setBadgeText({ text: done ? '' : '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#c8102e' });
}

// Redirect blocked sites to the lesson until today's lesson is complete.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const state = await getState();
  if (isDoneToday(state)) return;
  const list = (state && state.settings && state.settings.blocklist) || DEFAULT_BLOCKLIST;
  if (!hostMatches(details.url, list)) return;
  chrome.tabs.update(details.tabId, { url: `${LESSON_URL}?from=${encodeURIComponent(details.url)}` });
});

chrome.action.onClicked.addListener(openLesson);

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('badge', { periodInMinutes: 15 });
  updateBadge();
  openLesson();
});

// Every time the browser starts and the lesson isn't done, it's the first thing you see.
chrome.runtime.onStartup.addListener(async () => {
  updateBadge();
  if (!isDoneToday(await getState())) openLesson();
});

chrome.alarms.onAlarm.addListener(updateBadge);
chrome.storage.onChanged.addListener(updateBadge);
