// ══════════════════════════════════════════════════════════════
//  Namaz Vaxtı AZ — Extension popup.js  v3
//  API: AlAdhan  |  method=2, school=1, timezonestring=Asia/Baku
//  Timezone: Asia/Baku (UTC+4) — always correct Azerbaijan time
// ══════════════════════════════════════════════════════════════

const PRAYERS = [
  { key:'Fajr',    az:'Sübh',   en:'FAJR',    icon:'🌙' },
  { key:'Dhuhr',   az:'Zöhr',   en:'GÜNORTA', icon:'☀️' },
  { key:'Asr',     az:'Əsr',    en:'İKİNDİ',  icon:'🌤' },
  { key:'Maghrib', az:'Məğrib', en:'AXŞAM',   icon:'🌇' },
  { key:'Isha',    az:'İşa',    en:'GECƏ',    icon:'🌃' },
];

const AZ_MONTHS = [
  'Yanvar','Fevral','Mart','Aprel','May','İyun',
  'İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr'
];

const HIJRI_MONTHS = [
  'Məhərrəm','Səfər','Rəbiül-əvvəl','Rəbiül-axir',
  'Cəmadiyül-əvvəl','Cəmadiyül-axir','Rəcəb','Şaban',
  'Ramazan','Şəvval','Zülqədə','Zülhicə'
];

// ── AZERBAIJAN TIME (UTC+4) ─────────────────────────────────────
// Critical: always derive local AZ time, regardless of user's PC timezone
function azNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Baku' }));
}

function azDateStr() {
  const n = azNow();
  return `${n.getDate()}-${n.getMonth()+1}-${n.getFullYear()}`;
}

// ── STATE ───────────────────────────────────────────────────────
let cachedTimings = null;
let cdTimer = null;

// ── BOOT ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  restoreCity();

  document.getElementById('city-sel').addEventListener('change', e => {
    persistCity(e.target.value);
    load(e.target.value);
  });
  document.getElementById('refresh').addEventListener('click', () =>
    load(document.getElementById('city-sel').value, true));
});

// ── CLOCK ────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const n = azNow();
    const el = document.getElementById('clock');
    if (el) el.textContent = `${zp(n.getHours())}:${zp(n.getMinutes())}:${zp(n.getSeconds())}`;
    // refresh rows on new minute so active/passed state stays correct
    if (cachedTimings && n.getSeconds() === 0) renderRows(cachedTimings);
  }
  tick();
  setInterval(tick, 1000);
}

// ── STORAGE ──────────────────────────────────────────────────────
function persistCity(v) {
  try { chrome.storage.local.set({ selected_city: v }); } catch(_) {}
}

function restoreCity() {
  try {
    chrome.storage.local.get('selected_city', r => {
      const sel = document.getElementById('city-sel');
      if (r.selected_city) {
        for (const o of sel.options)
          if (o.value === r.selected_city) { sel.value = r.selected_city; break; }
      }
      load(sel.value);
    });
  } catch(_) { load(document.getElementById('city-sel').value); }
}

// ── LOAD ─────────────────────────────────────────────────────────
function load(cityVal, force = false) {
  const [city, lat, lng] = cityVal.split('|');
  const dateStr  = azDateStr();
  const cacheKey = `nt_${city}_${dateStr}`;

  if (!force) {
    try {
      chrome.storage.local.get(cacheKey, r => {
        if (r[cacheKey]) renderAll(r[cacheKey]);
        else             doFetch(lat, lng, dateStr, cacheKey);
      });
      return;
    } catch(_) {}
  }
  doFetch(lat, lng, dateStr, cacheKey);
}

// ── FETCH ─────────────────────────────────────────────────────────
// method=2  → Islamic Society of North America (matches site)
// school=1  → Hanafi (affects Asr — matches site)
// timezonestring=Asia/Baku → correct Azerbaijan timezone for the API
async function doFetch(lat, lng, dateStr, cacheKey) {
  setUI('loading');
  try {
    const url = [
      `https://api.aladhan.com/v1/timings/${dateStr}`,
      `?latitude=${lat}`,
      `&longitude=${lng}`,
      `&method=2`,
      `&school=1`,
      `&timezonestring=Asia%2FBaku`
    ].join('');

    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.code !== 200) throw new Error('API cavab vermədi');

    const payload = { timings: json.data.timings, date: json.data.date };

    // persist cache
    try {
      const obj = {}; obj[cacheKey] = payload;
      chrome.storage.local.set(obj);
    } catch(_) {}

    renderAll(payload);
  } catch(e) {
    setUI('error', e.message);
  }
}

// ── RENDER ALL ────────────────────────────────────────────────────
function renderAll({ timings, date }) {
  cachedTimings = timings;
  renderDates(date);
  renderRows(timings);
  startCountdown(timings);
}

// ── DATES ────────────────────────────────────────────────────────
function renderDates(d) {
  const g = d.gregorian;
  document.getElementById('greg').textContent =
    `${zp(g.day)} ${AZ_MONTHS[g.month.number - 1]} ${g.year}`;

  const h = d.hijri;
  document.getElementById('hijri').textContent =
    `${zp(h.day)} ${HIJRI_MONTHS[h.month.number - 1]} ${h.year}`;
}

// ── PRAYER ROWS ───────────────────────────────────────────────────
function renderRows(timings) {
  const n      = azNow();
  const nowMin = n.getHours() * 60 + n.getMinutes();

  const mins = PRAYERS.map(p => {
    const [h, m] = timings[p.key].split(':').map(Number);
    return h * 60 + m;
  });

  let nextIdx = -1;
  for (let i = 0; i < mins.length; i++) {
    if (mins[i] > nowMin) { nextIdx = i; break; }
  }

  const wrap = document.getElementById('prayers');
  wrap.innerHTML = '';

  PRAYERS.forEach((p, i) => {
    const timeStr = timings[p.key].slice(0, 5);
    const passed  = mins[i] < nowMin;
    const isNext  = i === nextIdx;

    const row = document.createElement('div');
    row.className = 'row' +
      (isNext          ? ' active' : '') +
      (passed && !isNext ? ' passed' : '');

    row.innerHTML =
      `<div class="p-icon">${p.icon}</div>` +
      `<div class="p-names">` +
        `<div class="p-az">${p.az}` +
          (isNext ? `<span class="next-pill">Növbəti</span>` : '') +
        `</div>` +
        `<div class="p-en">${p.en}</div>` +
      `</div>` +
      `<div class="p-time">${timeStr}</div>`;

    wrap.appendChild(row);
  });

  const bar = document.getElementById('next-bar');
  if (nextIdx >= 0) {
    bar.style.display = 'flex';
    document.getElementById('next-name').textContent =
      `Növbəti: ${PRAYERS[nextIdx].az}`;
  } else {
    bar.style.display = 'none';
  }
}

// ── COUNTDOWN ─────────────────────────────────────────────────────
function startCountdown(timings) {
  if (cdTimer) clearInterval(cdTimer);

  function tick() {
    const n   = azNow();
    const sec = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
    let nxt   = -1;

    for (const p of PRAYERS) {
      const [h, m] = timings[p.key].split(':').map(Number);
      const ps = h * 3600 + m * 60;
      if (ps > sec) { nxt = ps; break; }
    }

    const el = document.getElementById('next-cd');
    if (!el || nxt < 0) return;

    const d = nxt - sec;
    el.textContent = `${zp(Math.floor(d/3600))}:${zp(Math.floor((d%3600)/60))}:${zp(d%60)}`;
  }

  tick();
  cdTimer = setInterval(tick, 1000);
}

// ── UI STATES ─────────────────────────────────────────────────────
function setUI(state, msg = '') {
  if (state === 'loading') {
    if (cdTimer) clearInterval(cdTimer);
    document.getElementById('next-bar').style.display = 'none';
    document.getElementById('prayers').innerHTML =
      `<div class="state-box"><div class="spinner"></div>Yüklənir...</div>`;
    document.getElementById('greg').textContent  = '...';
    document.getElementById('hijri').textContent = '...';
  } else if (state === 'error') {
    document.getElementById('prayers').innerHTML =
      `<div class="state-box">
         <div style="font-size:24px;margin-bottom:6px">⚠️</div>
         <div class="err-msg">${msg}</div>
         <div class="err-sub">İnternet bağlantısını yoxlayın</div>
       </div>`;
  }
}

// ── HELPERS ───────────────────────────────────────────────────────
function zp(n) { return String(n).padStart(2, '0'); }
