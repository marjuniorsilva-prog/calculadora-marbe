(function () {
  'use strict';
  const LOGIN_KEY = 'marbe_firebase_authorized';
  const LOCK_KEY = 'marbe_erp_single_tab_lock_v3';
  const TAB_KEY = 'marbe_erp_tab_id_v3';
  const LOCK_TTL_MS = 12000;
  const HEARTBEAT_MS = 3000;

  function localISODate(value = new Date()) {
    const d = value instanceof Date ? value : new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function localYearMonth(value = new Date()) {
    return localISODate(value).slice(0, 7);
  }

  window.MarbeDate = {
    today: () => localISODate(new Date()),
    date: localISODate,
    month: () => localYearMonth(new Date()),
    yearMonth: localYearMonth
  };

  const filename = decodeURIComponent((location.pathname.split('/').pop() || 'index.html')).toLowerCase();
  const isIndex = filename === 'index.html' || filename === '';
  let blocked = false;
  let heartbeat = null;

  function safeJson(raw) { try { return JSON.parse(raw); } catch (e) { return null; } }
  function now() { return Date.now(); }
  function tabId() {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = `${now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  }

  function isLoggedIn() { return localStorage.getItem(LOGIN_KEY) === 'true'; }
  function getLock() { return safeJson(localStorage.getItem(LOCK_KEY)); }
  function lockIsFresh(lock) { return !!(lock && lock.id && lock.ts && (now() - Number(lock.ts) < LOCK_TTL_MS)); }

  function renderBlocked() {
    blocked = true;
    window.MARBE_TAB_BLOCKED = true;
    const build = () => {
      if (document.getElementById('marbe-tab-lock-screen')) return;
      const div = document.createElement('div');
      div.id = 'marbe-tab-lock-screen';
      div.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#020617f2;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,Arial,sans-serif;color:#f8fafc;';
      div.innerHTML = `<div style="width:min(560px,100%);background:#111827;border:1px solid #334155;border-radius:16px;padding:32px;box-shadow:0 25px 60px rgba(0,0,0,.45);text-align:center;">
        <div style="font-size:38px;margin-bottom:12px;">🔒</div>
        <h2 style="margin:0 0 12px;font-size:22px;">O MARBE ERP já está aberto em outra aba</h2>
        <p style="margin:0 0 22px;color:#94a3b8;line-height:1.55;">Para proteger os dados, o sistema permite apenas uma aba operacional por vez. Feche a outra aba e tente novamente.</p>
        <button id="marbe-retry-lock" style="border:0;border-radius:9px;background:#3b82f6;color:white;font-weight:800;padding:13px 18px;cursor:pointer;">TENTAR NOVAMENTE</button>
        <p style="font-size:11px;color:#64748b;margin:18px 0 0;">Se a outra aba foi fechada inesperadamente, a trava é liberada automaticamente em poucos segundos.</p>
      </div>`;
      document.body.appendChild(div);
      document.getElementById('marbe-retry-lock').onclick = function () {
        const lock = getLock();
        if (!lockIsFresh(lock) || lock.id === tabId()) location.reload();
        else alert('A outra aba ainda está ativa. Feche-a antes de continuar.');
      };
    };
    if (document.body) build(); else document.addEventListener('DOMContentLoaded', build, {once:true});
  }

  function claimLock() {
    if (!isLoggedIn()) return true;
    const id = tabId();
    const current = getLock();
    if (lockIsFresh(current) && current.id !== id) {
      renderBlocked();
      return false;
    }
    localStorage.setItem(LOCK_KEY, JSON.stringify({id, ts: now(), page: filename}));
    blocked = false;
    window.MARBE_TAB_BLOCKED = false;
    const old = document.getElementById('marbe-tab-lock-screen');
    if (old) old.remove();
    if (!heartbeat) {
      heartbeat = setInterval(() => {
        if (!blocked && isLoggedIn()) {
          const l = getLock();
          if (!lockIsFresh(l) || l.id === tabId()) {
            localStorage.setItem(LOCK_KEY, JSON.stringify({id: tabId(), ts: now(), page: filename}));
          } else if (l.id !== tabId()) {
            renderBlocked();
          }
        }
      }, HEARTBEAT_MS);
    }
    return true;
  }

  function markLoggedIn() {
    localStorage.setItem(LOGIN_KEY, 'true');
    return claimLock();
  }

  function logout() {
    localStorage.removeItem(LOGIN_KEY);
    const l = getLock();
    if (l && l.id === tabId()) localStorage.removeItem(LOCK_KEY);
    blocked = false;
  }

  function ensureWritable() {
    if (!isLoggedIn()) {
      alert('A autenticação Firebase não está ativa. Entre novamente no sistema.');
      if (!isIndex) location.replace('index.html?auth=required');
      return false;
    }
    if (blocked) {
      alert('Ação bloqueada: o MARBE ERP está ativo em outra aba. Feche a outra aba para continuar.');
      return false;
    }
    const l = getLock();
    if (lockIsFresh(l) && l.id !== tabId()) {
      renderBlocked();
      alert('Ação bloqueada para evitar gravação simultânea em duas abas.');
      return false;
    }
    claimLock();
    return true;
  }

  window.MarbeGuard = {
    isLoggedIn,
    markLoggedIn,
    activate: claimLock,
    logout,
    ensureWritable,
    isBlocked: () => blocked
  };

  if (isLoggedIn()) claimLock();
  window.addEventListener('storage', (e) => {
    if (e.key !== LOCK_KEY || !isLoggedIn()) return;
    const l = getLock();
    if (lockIsFresh(l) && l.id !== tabId()) renderBlocked();
  });
})();
