// The cheerful parts: Bao the panda, sound effects, confetti and toasts.
// Kept apart from app.js so the lesson logic stays readable. Nothing here touches saved progress.
window.Fun = (() => {
  'use strict';

  const INK = '#2b2623';

  const EYES = {
    happy: `<circle cx="41" cy="59" r="5" fill="#fff"/><circle cx="79" cy="59" r="5" fill="#fff"/>
      <circle cx="42" cy="60" r="2.4" fill="${INK}"/><circle cx="78" cy="60" r="2.4" fill="${INK}"/>`,
    cheer: `<path d="M35 61 Q41 53 47 61" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <path d="M73 61 Q79 53 85 61" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    sad: `<circle cx="41" cy="62" r="5" fill="#fff"/><circle cx="79" cy="62" r="5" fill="#fff"/>
      <circle cx="41" cy="64" r="2.4" fill="${INK}"/><circle cx="79" cy="64" r="2.4" fill="${INK}"/>
      <path d="M90 70 q4 7 0 10 q-4 -3 0 -10" fill="#6bb8ff"/>`,
    love: `<path d="M41 65 l-6 -6 a3.6 3.6 0 0 1 6 -4 a3.6 3.6 0 0 1 6 4 z" fill="#ff6b8b"/>
      <path d="M79 65 l-6 -6 a3.6 3.6 0 0 1 6 -4 a3.6 3.6 0 0 1 6 4 z" fill="#ff6b8b"/>`,
  };

  const MOUTHS = {
    happy: `<path d="M52 85 Q60 92 68 85" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    cheer: `<path d="M50 84 Q60 100 70 84 Z" fill="#e2536b" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`,
    sad: `<path d="M52 91 Q60 85 68 91" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    love: `<path d="M52 85 Q60 93 68 85" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  };

  // Bao (宝, "treasure") the panda. mood: happy | cheer | sad | love
  function panda(mood = 'happy', size = 96) {
    const m = EYES[mood] ? mood : 'happy';
    const paws = m === 'cheer' ? `<circle cx="13" cy="50" r="10" fill="${INK}"/><circle cx="107" cy="50" r="10" fill="${INK}"/>` : '';
    const cheeks = m === 'sad' ? '' : '<circle cx="24" cy="80" r="7" fill="#ff9aa9" opacity=".55"/><circle cx="96" cy="80" r="7" fill="#ff9aa9" opacity=".55"/>';
    return `<svg class="panda ${m}" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="Bao the panda">
      <circle cx="30" cy="30" r="17" fill="${INK}"/><circle cx="90" cy="30" r="17" fill="${INK}"/>
      ${paws}
      <ellipse cx="60" cy="66" rx="47" ry="43" fill="#fff" stroke="${INK}" stroke-width="3"/>
      <ellipse cx="40" cy="61" rx="11" ry="14" fill="${INK}" transform="rotate(-14 40 61)"/>
      <ellipse cx="80" cy="61" rx="11" ry="14" fill="${INK}" transform="rotate(14 80 61)"/>
      ${EYES[m]}${cheeks}
      <ellipse cx="60" cy="77" rx="5" ry="3.5" fill="${INK}"/>
      ${MOUTHS[m]}
    </svg>`;
  }

  // ---- sound effects: short synthesized chimes, no audio files ----

  // Each note: [frequency Hz, start s, length s, waveform]
  const SOUNDS = {
    correct: [[660, 0, 0.12], [880, 0.1, 0.2]],
    wrong: [[233, 0, 0.16, 'triangle'], [196, 0.13, 0.24, 'triangle']],
    level: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]],
    complete: [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.2], [784, 0.52, 0.12], [1047, 0.62, 0.45]],
  };
  let ctx = null;

  function sound(name) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !SOUNDS[name]) return;
    try {
      ctx = ctx || new AC();
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime;
      for (const [freq, at, len, type] of SOUNDS[name]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(0.16, t0 + at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + len + 0.02);
      }
    } catch {
      // No audio on this device; the app works silently.
    }
  }

  // ---- confetti ----

  const COLORS = ['#c8102e', '#f5b301', '#1f8a4c', '#3b82f6', '#ff6b8b', '#8b5cf6'];
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function confetti(count = 70) {
    if (calm()) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('i');
      bit.style.left = Math.random() * 100 + '%';
      bit.style.background = COLORS[i % COLORS.length];
      bit.style.animationDelay = Math.random() * 0.5 + 's';
      bit.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
      bit.style.setProperty('--drift', (Math.random() * 2 - 1) * 120 + 'px');
      bit.style.setProperty('--spin', (Math.random() * 2 - 1) * 900 + 'deg');
      box.appendChild(bit);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4000);
  }

  // ---- toast ----

  let toastTimer = null;

  function toast(html) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = html;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  return { panda, sound, confetti, toast };
})();
