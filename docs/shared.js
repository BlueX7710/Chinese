// Shared by the lesson page and the extension's background worker.
var DEFAULT_BLOCKLIST = [
  'youtube.com',
  'reddit.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'netflix.com',
  'twitch.tv',
];

function dayStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isDoneToday(state) {
  return !!state && Array.isArray(state.completedDays) && state.completedDays.includes(dayStr());
}

function hostMatches(url, list) {
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
  return list.some((d) => host === d || host.endsWith('.' + d));
}
