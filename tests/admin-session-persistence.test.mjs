import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const authPath = resolve('admin/js/admin-auth.js');
const authSource = readFileSync(authPath, 'utf8');

function loadAdminAuth({ currentLevel = 'aal2', nextLevel = 'aal2' } = {}) {
  let passwordSignIns = 0;
  const currentSession = {
    access_token: 'persisted-aal2-token',
    user: { id: 'founder-1', email: 'founder@example.com' }
  };

  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: currentSession }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => {
        passwordSignIns += 1;
        throw new Error('signInWithPassword não deveria ser chamado');
      },
      signOut: async () => ({ error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel, nextLevel, currentAuthenticationMethods: [] },
          error: null
        })
      }
    },
    from: () => ({
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({
        data: { id: 'founder-1', username: 'founder', display_name: 'Founder' },
        error: null
      })
    }),
    rpc: async name => ({
      data: name === 'echo_admin_identity' || name === 'echo_is_founder_identity',
      error: null
    })
  };

  const context = vm.createContext({
    __supabase: supabase,
    clearTimeout,
    console,
    document: { documentElement: { innerHTML: '' } },
    location: { replace() {} },
    sessionStorage: {
      getItem() { return null; },
      removeItem() {},
      setItem() {}
    },
    setTimeout
  });

  const executable = authSource
    .replace(/^import[^\n]+\n/, 'const supabase = globalThis.__supabase;\n')
    .replace(/export async function /g, 'async function ')
    .replace(/export\{[^}]+\};\s*$/m, '')
    .concat('\nglobalThis.__adminAuth = { loginAdmin };\n');

  vm.runInContext(executable, context, { filename: authPath });
  return {
    loginAdmin: context.__adminAuth.loginAdmin,
    passwordSignIns: () => passwordSignIns
  };
}

test('reutiliza a sessão Founder AAL2 persistida sem criar login AAL1 novo', async () => {
  const auth = loadAdminAuth();
  const result = await auth.loginAdmin(' Founder@Example.com ', 'senha-nao-utilizada');

  assert.equal(result.reusedSession, true);
  assert.equal(result.needsMfa, false);
  assert.equal(result.aal.currentLevel, 'aal2');
  assert.equal(auth.passwordSignIns(), 0);
});

test('sessão Founder AAL1 existente segue para MFA sem recriar a sessão', async () => {
  const auth = loadAdminAuth({ currentLevel: 'aal1', nextLevel: 'aal2' });
  const result = await auth.loginAdmin('founder@example.com', 'senha-nao-utilizada');

  assert.equal(result.reusedSession, true);
  assert.equal(result.needsMfa, true);
  assert.equal(auth.passwordSignIns(), 0);
});
