const fs = require('fs');
const path = require('path');
const https = require('https');

/* ---------------- Update checking ---------------- */

// Baked-in fallback version — only used if we've never recorded an
// installed package version yet (first run after a fresh install).
// Once an update lands (jsx and/or UI files), the real "current version"
// comes from LOCAL_VERSION_PATH below, since the updater can now patch
// every file in the extension, not just hostscript.jsx.
const PANEL_VERSION = '2.0.3';

// The installed package version is tracked separately, since it CAN
// change in-place via the updater. We persist it to a small local JSON
// file (next to hostscript.jsx) so the displayed version survives panel
// reloads and reflects whatever code is actually running right now,
// instead of being hardcoded and going stale the moment an update lands.
const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/danuongbi-dotcom/magicbroom/refs/heads/main/version.json';

// getSystemPath('extension') returns a file:// URI (e.g.
// "file:///C:/Users/Admin/.../project-auditor-cep" on Windows, or
// "file:///Users/.../project-auditor-cep" on Mac), NOT a plain OS path.
// Passing that directly into path.join + fs.* mixes URI-style forward
// slashes/the "file:" scheme with Node's OS-specific separators, producing
// a broken hybrid path like "file:\C:\Users\..." that fs.writeFileSync
// can't resolve (ENOENT).
//
// fileURLToPath's automatic platform detection isn't reliable across every
// Node/CEF version CEP might bundle, so we detect a Windows-style drive
// letter (file:///C:/...) explicitly and convert it ourselves rather than
// trusting process.platform branching inside the built-in helper.
function systemPathToFsPath(systemPath) {
  if (!/^file:\/\//i.test(systemPath)) return systemPath;

  // Strip the "file://" prefix, leaving a URI-encoded path that starts
  // with "/" on every platform (e.g. "/C:/Users/..." or "/Users/...").
  let stripped;
  try {
    stripped = decodeURIComponent(systemPath.replace(/^file:\/\//i, ''));
  } catch (e) {
    console.error('[Project Auditor] Could not decode extension path URI:', systemPath, e);
    return systemPath;
  }

  const windowsDriveMatch = stripped.match(/^\/([a-zA-Z]):(\/.*)?$/);
  if (windowsDriveMatch) {
    // "/C:/Users/Admin/..." -> "C:\Users\Admin\..."
    const drive = windowsDriveMatch[1];
    const rest = (windowsDriveMatch[2] || '').replace(/\//g, '\\');
    return `${drive}:${rest}`;
  }

  // No drive letter found -> already a plain POSIX-style path (Mac/Linux).
  return stripped;
}

const EXTENSION_ROOT = systemPathToFsPath(window.__adobe_cep__.getSystemPath('extension'));
const HOSTSCRIPT_PATH = path.join(EXTENSION_ROOT, 'jsx', 'hostscript.jsx');
const MAIN_JS_PATH = path.join(EXTENSION_ROOT, 'js', 'main.js');
const INDEX_HTML_PATH = path.join(EXTENSION_ROOT, 'index.html');
const STYLE_CSS_PATH = path.join(EXTENSION_ROOT, 'css', 'style.css');
// Small local state file tracking which package version is actually on
// disk right now (covers hostscript.jsx + main.js + index.html + style.css).
// Lives next to hostscript.jsx so it travels with the extension and
// survives panel reloads/AE restarts.
const LOCAL_VERSION_PATH = path.join(EXTENSION_ROOT, 'jsx', 'jsx-version.json');

function readInstalledPackageVersion() {
  try {
    const raw = fs.readFileSync(LOCAL_VERSION_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.version === 'string') return parsed.version;
  } catch (e) {
    // No file yet (fresh install) or it's corrupt — both are fine, we just
    // don't have a known installed version to report until the first check/update.
  }
  return null;
}

function writeInstalledPackageVersion(version) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_VERSION_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_VERSION_PATH, JSON.stringify({ version: version }), 'utf8');
    return true;
  } catch (e) {
    console.error('[Project Auditor] Could not persist installed package version:', e);
    return false;
  }
}

console.log('[Project Auditor] EXTENSION_ROOT:', EXTENSION_ROOT);
console.log('[Project Auditor] HOSTSCRIPT_PATH:', HOSTSCRIPT_PATH);
console.log('[Project Auditor] hostscript.jsx exists at that path:', fs.existsSync(HOSTSCRIPT_PATH));

let installedPackageVersion = readInstalledPackageVersion(); // null until known
console.log('[Project Auditor] Installed package version:', installedPackageVersion || '(unknown — never recorded)');

document.getElementById('current-version').textContent = installedPackageVersion
  ? installedPackageVersion
  : PANEL_VERSION;

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// Node's https.get does not follow redirects and has no built-in timeout —
// either of those can leave a request hanging forever with no error and no
// data, which is what "stuck at downloading" looks like from the panel.
// This wraps https.get with: a hard timeout, up to 5 redirect hops followed
// manually, and a check that the final response is actually 200 before we
// trust its body.
function httpsGetFollowingRedirects(url, onSuccess, onError, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 5;

  const req = https.get(url, (res) => {
    const status = res.statusCode;

    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume(); // discard body, we're not using this response
      if (redirectsLeft <= 0) {
        onError(new Error('Too many redirects while fetching: ' + url));
        return;
      }
      // location may be relative; resolve it against the current url
      const nextUrl = new URL(res.headers.location, url).toString();
      httpsGetFollowingRedirects(nextUrl, onSuccess, onError, redirectsLeft - 1);
      return;
    }

    if (status !== 200) {
      res.resume();
      onError(new Error('Unexpected HTTP ' + status + ' from ' + url));
      return;
    }

    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => onSuccess(data));
    res.on('error', onError);
  });

  req.on('error', onError);

  // 15s is generous for a small JSON/JSX file; if it's still hanging by then
  // something is wrong (network block, DNS, stalled connection) and the user
  // deserves an error message instead of an indefinite spinner.
  req.setTimeout(15000, () => {
    req.destroy(new Error('Request timed out after 15s: ' + url));
  });
}

function checkForUpdate() {
  httpsGetFollowingRedirects(
    VERSION_CHECK_URL,
    (data) => {
      try {
        const info = JSON.parse(data);
        // If we've never recorded an installed package version (fresh
        // install, or upgrading from a build that predates this tracking),
        // fall back to comparing against PANEL_VERSION so existing behavior
        // is preserved.
        const baseline = installedPackageVersion || PANEL_VERSION;
        if (compareVersions(info.version, baseline) > 0) {
          showUpdateBanner(info);
        }
      } catch (e) {
        console.error('Update check: could not parse version.json', e, data);
      }
    },
    (e) => console.error('Update check failed:', e.message)
  );
}

const REMIND_LATER_KEY = 'paUpdateRemindLaterVersion';

function showUpdateBanner(info) {
  // If the user already chose "Remind me later" for this exact version,
  // don't nag them again until a newer version is published.
  let remindedVersion = null;
  try { remindedVersion = sessionStorage.getItem(REMIND_LATER_KEY); } catch (e) {}
  if (remindedVersion && compareVersions(info.version, remindedVersion) <= 0) return;

  const banner = document.getElementById('update-banner');
  banner.querySelector('.version-text').textContent = `Update available: v${info.version}`;
  const notesEl = document.getElementById('update-notes');
  notesEl.textContent = info.notes ? info.notes : '';
  banner.style.display = 'flex';
  document.getElementById('update-btn').onclick = () => downloadUpdate(info);
  document.getElementById('remind-later-btn').onclick = () => {
    try { sessionStorage.setItem(REMIND_LATER_KEY, info.version); } catch (e) {}
    banner.style.display = 'none';
  };
}

// Maps the keys used in version.json's "files" object to where each one
// lives on disk. "jsx" is special: after writing it we $.evalFile() it into
// the live ExtendScript engine, so a jsx-only update applies instantly with
// no panel reload. The other three (mainJs/html/css) can't be hot-swapped
// the same way — JS/HTML/CSS only take effect on the next page load — so if
// any of those are present in the update we reload the whole panel once
// every file is safely written.
const UPDATE_FILE_TARGETS = {
  jsx: HOSTSCRIPT_PATH,
  mainJs: MAIN_JS_PATH,
  html: INDEX_HTML_PATH,
  css: STYLE_CSS_PATH
};

// Back-compat: older version.json files only ever had a top-level "jsxUrl"
// instead of a "files" map. Normalize both shapes into one files map so the
// rest of the update logic doesn't need to care which format was published.
function normalizeUpdateFiles(info) {
  if (info.files && typeof info.files === 'object') return info.files;
  if (info.jsxUrl) return { jsx: info.jsxUrl };
  return {};
}

function downloadUpdate(info) {
  const statusEl = document.getElementById('update-status');
  const updateBtn = document.getElementById('update-btn');

  const files = normalizeUpdateFiles(info);
  const keys = Object.keys(files).filter((k) => UPDATE_FILE_TARGETS[k]);

  if (keys.length === 0) {
    statusEl.textContent = 'Update failed: version.json has no recognized "files" entries (expected jsx/mainJs/html/css).';
    return;
  }

  statusEl.textContent = `Downloading update… (0/${keys.length})`;
  updateBtn.disabled = true;

  const downloaded = {}; // key -> file content, only once every file succeeds do we write anything

  function fail(message) {
    updateBtn.disabled = false;
    statusEl.textContent = 'Update failed: ' + message;
  }

  function downloadNext(i) {
    if (i >= keys.length) {
      writeAllAndApply();
      return;
    }

    const key = keys[i];
    const url = files[key];
    statusEl.textContent = `Downloading update… (${i + 1}/${keys.length}: ${key})`;

    httpsGetFollowingRedirects(
      url,
      (data) => {
        // Sanity check: a real source file should not be an HTML error/login
        // page, which is what a bad GitHub URL silently serves instead.
        const looksLikeHtml = /^\s*<(!doctype|html)/i.test(data);
        // index.html is the one legitimate exception, since it's supposed
        // to actually be HTML.
        if (key !== 'html' && (looksLikeHtml || data.trim() === '')) {
          fail(`the URL for "${key}" did not return a script file (got HTML or empty content). Check version.json — it must be a raw file URL, not a GitHub page link.`);
          return;
        }
        if (key === 'html' && data.trim() === '') {
          fail(`the URL for "${key}" returned empty content.`);
          return;
        }

        downloaded[key] = data;
        downloadNext(i + 1);
      },
      (e) => fail(`could not download "${key}" (${e.message})`)
    );
  }

  function writeAllAndApply() {
    // Write every file first. If any single write fails, we stop — we'd
    // rather leave the old files in place than end up with a half-updated,
    // mismatched set of jsx/main.js/html/css.
    try {
      keys.forEach((key) => {
        const destPath = UPDATE_FILE_TARGETS[key];
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, downloaded[key], 'utf8');
      });
    } catch (e) {
      fail('could not write updated files (' + e.message + '). EXTENSION_ROOT: ' + EXTENSION_ROOT);
      console.error('Write failed during update:', e);
      return;
    }

    const uiFilesChanged = keys.some((k) => k !== 'jsx');

    // jsx changes can be hot-loaded into the live ExtendScript engine right
    // now without touching the panel UI at all.
    const applyJsx = (cb) => {
      if (!downloaded.jsx) { cb(); return; }
      const reloadCall = `$.evalFile("${HOSTSCRIPT_PATH.replace(/\\/g, '/')}")`;
      window.__adobe_cep__.evalScript(reloadCall, (result) => {
        if (result && /^Error/i.test(String(result))) {
          fail('the new hostscript.jsx failed to load: ' + result);
          cb(false);
          return;
        }
        cb(true);
      });
    };

    applyJsx((jsxOk) => {
      if (jsxOk === false) return; // applyJsx already reported failure

      writeInstalledPackageVersion(info.version);
      installedPackageVersion = info.version;

      if (uiFilesChanged) {
        // main.js/index.html/style.css only take effect on a fresh page
        // load, so reload the whole panel now that every file on disk is
        // already the new version — the reload will pick everything up,
        // including the jsx, in one consistent pass.
        statusEl.textContent = `Updated to v${info.version}. Reloading panel…`;
        setTimeout(() => window.location.reload(), 400);
        return;
      }

      // jsx-only update: nothing else needs a reload.
      document.getElementById('current-version').textContent = installedPackageVersion;
      statusEl.textContent = `Updated to v${info.version}. New logic is active.`;
      document.getElementById('update-banner').style.display = 'none';
      updateBtn.disabled = false;
    });
  }

  downloadNext(0);
}

/* ---------------- Bridge to ExtendScript ---------------- */

function callJSX(fnName, args) {
  return new Promise((resolve) => {
    const argStr = (args || []).map((a) => JSON.stringify(a)).join(',');
    window.__adobe_cep__.evalScript(`${fnName}(${argStr})`, (result) => resolve(result));
  });
}

// Parses a JSON string returned from hostscript.jsx into a results array.
// Surfaces three failure modes that previously rendered as a silent empty list:
//   1. evalScript itself failing (result is undefined/null or the literal "EvalScript error.")
//   2. hostscript.jsx throwing before it could JSON.stringify anything (result is not valid JSON)
//   3. hostscript.jsx catching the error itself and returning {"error": "..."}
function parseSearchResult(raw) {
  if (raw === undefined || raw === null || raw === 'EvalScript error.') {
    throw new Error('No response from the ExtendScript engine (evalScript failed). Try reopening the panel.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('hostscript.jsx returned invalid JSON: ' + raw);
  }
  if (parsed && !Array.isArray(parsed) && parsed.error) {
    throw new Error('hostscript.jsx error: ' + parsed.error);
  }
  return Array.isArray(parsed) ? parsed : [];
}

/* ---------------- App state ---------------- */

let lastSearchMode = '';      // '', 'space', 'hiddenLayers', 'hiddenFX', 'searchFX', 'dupeNames'
let currentResults = [];      // [{compIndex, layerIndex?, fxIndex?, label, status}]
let selectedRows = new Set(); // indices into currentResults
let lastClickedRow = null;    // for shift-click range select
let hasSearched = false;      // distinguishes "never run a search yet" from "ran, found 0"
let lastError = null;         // set when a search call throws; shown instead of the greeting

const greetings = [
  "Xin chào! Chúc một ngày làm việc vui vẻ ☀️",
  "Hôm nay render nhanh, deadline xa - hoàn hảo! 🎬",
  "Cà phê đã sẵn sàng? Bắt đầu thôi! ☕",
  "Mọi layer đều ổn, mọi thứ đều đẹp. Tin tưởng vào bản thân! ✨",
  "Chao buoi sang! Hom nay audit se sach bong 🧹",
  "Khong co hidden layer nao thoat khoi tam mat ban! 🔍",
  "Project hom nay chac chan se xuat sac 🚀",
  "Bat dau mot ngay moi — khong co effect nao bi bo sot! 💪",
  "Lam viec cham chi, ve som, ngu ngon. Let's go! 🌟",
  "Moi frame deu quan trong. Ban dang lam tot lam! 🎞️",
  "Render xong roi, an mot mieng banh nao! 🍰",
  "Hom nay co the la ngay khong co bug. Cu hy vong! 🤞",
  "Project sach, tam tri sach, sang tao bay cao! 🧠",
  "Keyframe dung cho, deadline cung dung lo! ⏱️",
  "Mot ngay moi, mot co hoi de project hoan hao hon! 🌈",
  "Coffee + After Effects = cong thuc thanh cong ☕🎬",
  "Ban da kiem tra het roi, gio la luc nghi ngoi 5 phut 😌",
  "Khong co gi sai ca, chi la chua toi uc thoi 😄",
  "Chuc ban render nhanh, export gon, khach hang vui! 📦",
  "Hom nay la ngay tot de don dep project cu! 🗂️"
  "Nhà triết học lỗi lạc Socrates nổi tiếng với câu nói đầy trí tuệ: Nếu bạn không có được những gì mình muốn, bạn phải khó chịu; nếu bạn có được những gì bạn không muốn bạn cũng khó chịu; ngay cả khi bạn có được những gì mình muốn thì vẫn khó chịu vì không thể giữ được mãi mãi. Tâm trí của bạn là vật cản lớn nhất. Nó muốn một cuộc sống tự do, không có sự thay đổi, không có sự đau đớn, và cũng không có cái chết. Nhưng sự thay đổi là một điều luật và không có sự giả dối nào có thể thay đổi thực tế đó"
];

/* ---------------- DOM refs ---------------- */

const resultBody = document.getElementById('result-body');
const resultTable = document.querySelector('.result-table');
const greetingEl = document.getElementById('greeting');
const counterLabel = document.getElementById('counter-label');
const cbIncludeLocked = document.getElementById('cb-include-locked');
const searchInput = document.getElementById('search-input');

/* ---------------- Rendering ---------------- */

function render() {
  selectedRows.clear();
  resultBody.innerHTML = '';

  if (lastError) {
    resultTable.style.display = 'none';
    greetingEl.style.display = 'block';
    greetingEl.textContent = '⚠ ' + lastError;
    counterLabel.textContent = 'Total items: 0  |  Double-click to jump to item';
    return;
  }

  if (currentResults.length === 0) {
    resultTable.style.display = 'none';
    greetingEl.style.display = 'block';
    greetingEl.textContent = hasSearched
      ? 'No items found for this check 🎉'
      : greetings[Math.floor(Math.random() * greetings.length)];
    counterLabel.textContent = 'Total items: 0  |  Double-click to jump to item';
    return;
  }

  resultTable.style.display = 'table';
  greetingEl.style.display = 'none';

  currentResults.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(idx);

    const tdPath = document.createElement('td');
    tdPath.className = 'col-path';
    tdPath.textContent = item.label;
    tdPath.title = item.label;

    const tdStatus = document.createElement('td');
    tdStatus.className = 'col-status';
    tdStatus.textContent = item.status;

    tr.appendChild(tdPath);
    tr.appendChild(tdStatus);

    tr.addEventListener('click', (e) => onRowClick(e, idx));
    tr.addEventListener('dblclick', () => onRowDoubleClick(idx));

    resultBody.appendChild(tr);
  });

  counterLabel.textContent = `Total items: ${currentResults.length}  |  Double-click to jump to item`;
}

function onRowClick(e, idx) {
  const rows = Array.from(resultBody.children);

  if (e.shiftKey && lastClickedRow !== null) {
    const bounds = [lastClickedRow, idx].sort((a, b) => a - b);
    selectedRows.clear();
    for (let i = bounds[0]; i <= bounds[1]; i++) selectedRows.add(i);
  } else if (e.metaKey || e.ctrlKey) {
    if (selectedRows.has(idx)) selectedRows.delete(idx);
    else selectedRows.add(idx);
    lastClickedRow = idx;
  } else {
    selectedRows.clear();
    selectedRows.add(idx);
    lastClickedRow = idx;
  }

  rows.forEach((row, i) => row.classList.toggle('selected', selectedRows.has(i)));
}

function onRowDoubleClick(idx) {
  const item = currentResults[idx];
  if (!item) return;
  callJSX('navigateToItem', [lastSearchMode, JSON.stringify(item)]).then((result) => {
    if (result && result !== 'ok') alert(result);
  });
}

/* ---------------- Search actions ---------------- */

function runFindSpace() {
  lastSearchMode = 'space';
  callJSX('findCompsWithSpaces', []).then((json) => {
    try {
      currentResults = parseSearchResult(json);
      lastError = null;
    } catch (e) {
      currentResults = [];
      lastError = e.message;
    }
    hasSearched = true;
    render();
  });
}

function runFixSpace() {
  callJSX('fixSpaces', []).then((json) => {
    const parsed = JSON.parse(json || '{"fixCount":0}');
    runFindSpace();
    alert(`Successfully fixed ${parsed.fixCount} names.`);
  });
}

function runFindHidden() {
  lastSearchMode = 'hiddenLayers';
  callJSX('findHiddenLayers', [cbIncludeLocked.checked]).then((json) => {
    try {
      currentResults = parseSearchResult(json);
      lastError = null;
    } catch (e) {
      currentResults = [];
      lastError = e.message;
    }
    hasSearched = true;
    render();
  });
}

function runFindEffects() {
  lastSearchMode = 'hiddenFX';
  callJSX('findHiddenEffects', [cbIncludeLocked.checked]).then((json) => {
    try {
      currentResults = parseSearchResult(json);
      lastError = null;
    } catch (e) {
      currentResults = [];
      lastError = e.message;
    }
    hasSearched = true;
    render();
  });
}

function runFindEffName() {
  // mode is set before the empty check on purpose — matches the original script's behavior
  lastSearchMode = 'searchFX';
  const term = searchInput.value.trim();
  if (term === '') return;
  callJSX('searchEffectsByName', [term, cbIncludeLocked.checked]).then((json) => {
    try {
      currentResults = parseSearchResult(json);
      lastError = null;
    } catch (e) {
      currentResults = [];
      lastError = e.message;
    }
    hasSearched = true;
    render();
  });
}

function rerunLastSearch() {
  if (lastSearchMode === 'hiddenLayers') runFindHidden();
  else if (lastSearchMode === 'hiddenFX') runFindEffects();
  else if (lastSearchMode === 'searchFX') runFindEffName();
  // 'space', 'dupeNames' and '' are unaffected by the locked-layer filter, same as the original
}

/* ---------------- Delete actions ---------------- */

function runDeleteSelected() {
  const items = Array.from(selectedRows).map((i) => currentResults[i]);
  if (items.length === 0) return;
  callJSX('deleteSelected', [lastSearchMode, JSON.stringify(items)]).then(() => {
    refreshAfterDelete();
  });
}

function runDeleteAll() {
  const term = lastSearchMode === 'searchFX' ? searchInput.value.trim() : '';
  callJSX('deleteAllByMode', [lastSearchMode, cbIncludeLocked.checked, term]).then(() => {
    refreshAfterDelete();
  });
}

function refreshAfterDelete() {
  if (lastSearchMode === 'space') runFindSpace();
  else if (lastSearchMode === 'hiddenLayers') runFindHidden();
  else if (lastSearchMode === 'hiddenFX') runFindEffects();
  else if (lastSearchMode === 'searchFX') runFindEffName();
  else if (lastSearchMode === 'dupeNames') runFindDupes();
  else { currentResults = []; render(); }
}

/* ---------------- Find duplicate comp names ---------------- */

function runFindDupes() {
  lastSearchMode = 'dupeNames';
  callJSX('findDuplicateCompNames', []).then((json) => {
    try {
      currentResults = parseSearchResult(json);
      lastError = null;
    } catch (e) {
      currentResults = [];
      lastError = e.message;
    }
    hasSearched = true;
    render();
  });
}

/* ---------------- CM: merge 2 selected comps/footage ---------------- */

function runCM() {
  callJSX('mergeTwoComps', []).then((result) => {
    // mergeTwoComps returns "ok" on success, or an error/alert message string otherwise.
    if (result && result !== 'ok') alert(result);
  });
}

/* ---------------- Wire up controls ---------------- */

document.getElementById('btn-find-space').addEventListener('click', runFindSpace);
document.getElementById('btn-fix-space').addEventListener('click', runFixSpace);
document.getElementById('btn-find-hidden').addEventListener('click', runFindHidden);
document.getElementById('btn-find-effects').addEventListener('click', runFindEffects);
document.getElementById('btn-find-fx-name').addEventListener('click', runFindEffName);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runFindEffName(); });

document.getElementById('btn-find-dupes').addEventListener('click', runFindDupes);
document.getElementById('btn-del-sel').addEventListener('click', runDeleteSelected);
document.getElementById('btn-del-all').addEventListener('click', runDeleteAll);
document.getElementById('btn-cm').addEventListener('click', runCM);

cbIncludeLocked.addEventListener('change', rerunLastSearch);

/* ---------------- Init ---------------- */

render();
checkForUpdate();
