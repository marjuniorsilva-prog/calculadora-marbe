import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export const MARBE_ALLOWED_EMAILS = Object.freeze([
  "mar.junior.silva@gmail.com"
]);

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isAllowedUser(user) {
  if (!user) return false;
  const email = normalizarEmail(user.email);
  return !!user.emailVerified && MARBE_ALLOWED_EMAILS.includes(email);
}

export function authErrorMessage(error) {
  const code = String(error?.code || '');
  if (code === 'marbe/not-authorized') return 'Esta conta Google não está autorizada a acessar o MARBE ERP.';
  if (code === 'marbe/not-signed-in') return 'Entre com a conta Google autorizada para acessar o MARBE ERP.';
  if (code.includes('popup-closed-by-user')) return 'O login foi cancelado antes de concluir.';
  if (code.includes('popup-blocked')) return 'O navegador bloqueou a janela de login. O sistema tentará abrir o login na própria página.';
  if (code.includes('unauthorized-domain')) return 'Este endereço ainda não está autorizado no Firebase Authentication. Adicione o domínio em Authentication > Settings > Authorized domains.';
  if (code.includes('network-request-failed')) return 'Falha de internet durante o login. Verifique a conexão e tente novamente.';
  return `Não foi possível autenticar no Firebase${error?.message ? ': ' + error.message : '.'}`;
}

async function prepararPersistencia(auth) {
  try { await setPersistence(auth, browserLocalPersistence); } catch (e) { console.warn('Persistência Firebase:', e); }
}

export async function loginWithGoogle(app) {
  const auth = getAuth(app);
  await prepararPersistencia(auth);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    login_hint: MARBE_ALLOWED_EMAILS[0],
    prompt: 'select_account'
  });
  let cred;
  try {
    cred = await signInWithPopup(auth, provider);
  } catch (error) {
    if (String(error?.code || '').includes('popup-blocked')) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
  if (!isAllowedUser(cred?.user)) {
    const deniedEmail = cred?.user?.email || '';
    await signOut(auth);
    const err = new Error(`Conta não autorizada: ${deniedEmail}`);
    err.code = 'marbe/not-authorized';
    throw err;
  }
  return cred.user;
}

export async function logoutFirebase(app) {
  const auth = getAuth(app);
  await signOut(auth);
}

export function observeAuthorizedUser(app, callback) {
  const auth = getAuth(app);
  prepararPersistencia(auth);
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ status: 'signed-out', user: null });
      return;
    }
    if (!isAllowedUser(user)) {
      const denied = { email: user.email || '', uid: user.uid || '' };
      try { await signOut(auth); } catch (_) {}
      callback({ status: 'denied', user: denied });
      return;
    }
    callback({ status: 'authorized', user });
  }, (error) => callback({ status: 'error', error, user: null }));
}

export function requireAuthorizedUser(app) {
  const auth = getAuth(app);
  return new Promise((resolve, reject) => {
    let unsubscribe = null;
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribe) unsubscribe();
      if (!user) {
        const err = new Error('Usuário não autenticado.');
        err.code = 'marbe/not-signed-in';
        reject(err);
        return;
      }
      if (!isAllowedUser(user)) {
        try { await signOut(auth); } catch (_) {}
        const err = new Error(`Conta não autorizada: ${user.email || ''}`);
        err.code = 'marbe/not-authorized';
        reject(err);
        return;
      }
      resolve(user);
    }, (error) => {
      if (unsubscribe) unsubscribe();
      reject(error);
    });
  });
}

export function applyUserProfile(user) {
  const run = () => {
    const nome = user?.displayName || user?.email || 'Usuário autorizado';
    document.querySelectorAll('.user-name').forEach(el => el.textContent = nome);
    document.querySelectorAll('.user-role').forEach(el => el.textContent = 'Acesso Firebase autorizado');
    document.querySelectorAll('.avatar').forEach(el => {
      const partes = String(nome).trim().split(/\s+/).filter(Boolean);
      const iniciais = (partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : String(nome).slice(0,2)).toUpperCase();
      el.textContent = iniciais || 'MB';
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

export function redirectToLogin(reason = 'required') {
  const file = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  const current = `${file}${location.search}${location.hash}`;
  const qs = new URLSearchParams();
  qs.set('return', current);
  qs.set('auth', reason);
  location.replace(`index.html?${qs.toString()}`);
}
