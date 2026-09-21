import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const LOOP_KEY = 'echoarena_admin_hops';
const LOOP_LIMIT = 3;
const HYDRATION_TIMEOUT_MS = 5000;
const PROFILE_PUBLIC_FIELDS = 'id, username, display_name';

function getHops(){return parseInt(sessionStorage.getItem(LOOP_KEY)||'0',10);}
function clearHops(){sessionStorage.removeItem(LOOP_KEY);}
async function signOutLocal(){const{error}=await supabase.auth.signOut({scope:'local'});if(error)console.error('[admin-auth] Erro ao encerrar sessão local:',error);return error;}
function redirectTo(url){const hops=getHops();if(hops>=LOOP_LIMIT){clearHops();console.error('[admin-auth] Loop de redirecionamento interrompido.');document.documentElement.innerHTML='<pre style="padding:2rem;font:14px/1.6 monospace;color:#ffb4bd;background:#0b1221">Loop de autenticacao interrompido.\n\nRecarregue a pagina para tentar novamente.</pre>';throw new Error('LOOP_INTERROMPIDO');}sessionStorage.setItem(LOOP_KEY,String(hops+1));location.replace(url);}

async function resolveSession(){const{data,error}=await supabase.auth.getSession();if(error)throw error;if(data?.session?.user)return data.session;return new Promise(resolve=>{let settled=false;const finish=session=>{if(settled)return;settled=true;clearTimeout(timer);try{listener?.subscription?.unsubscribe();}catch(_){}resolve(session);};const{data:listener}=supabase.auth.onAuthStateChange((event,session)=>{if(session?.user){finish(session);return;}if(event==='INITIAL_SESSION'||event==='SIGNED_OUT')finish(null);});const timer=setTimeout(()=>finish(null),HYDRATION_TIMEOUT_MS);});}
async function getAalState(){const{data,error}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;return{currentLevel:data?.currentLevel||'aal1',nextLevel:data?.nextLevel||null,currentAuthenticationMethods:data?.currentAuthenticationMethods||[]};}
function normalizeIdentityEmail(value){return String(value??'').trim().toLowerCase();}
async function readPublicProfile(userId){const{data,error}=await supabase.from('profiles').select(PROFILE_PUBLIC_FIELDS).eq('id',userId).maybeSingle();if(error)throw error;if(!data){const err=new Error('Perfil não encontrado para este usuário.');err.code='PERFIL_AUSENTE';throw err;}return data;}

/* Identidade separada de autorização:
   - echo_admin_identity(): staff/Founder ativo, sem exigir AAL2.
   - echo_is_founder_identity(): identifica somente o Founder singleton.
   - echo_is_admin(): staff modular em AAL1; Founder somente em AAL2.
   O contrato crítico permanece explícito no código: aal.currentLevel !== 'aal2'. */
async function getAdminIdentityProfile(userId){
  if(!userId)throw new Error('Usuário não identificado.');
  const[profileResult,identityResult,founderResult]=await Promise.all([
    readPublicProfile(userId),
    supabase.rpc('echo_admin_identity'),
    supabase.rpc('echo_is_founder_identity')
  ]);
  if(identityResult.error)throw identityResult.error;
  if(founderResult.error)throw founderResult.error;
  if(identityResult.data!==true)return{...profileResult,role:'user',is_admin:false,is_founder:false};
  return{...profileResult,role:'admin',is_admin:true,is_founder:founderResult.data===true};
}

async function getAdminProfile(userId){
  if(!userId)throw new Error('Usuário não identificado.');
  const[profileResult,adminResult,founderResult]=await Promise.all([
    readPublicProfile(userId),
    supabase.rpc('echo_is_admin'),
    supabase.rpc('echo_is_founder_identity')
  ]);
  if(adminResult.error)throw adminResult.error;
  if(founderResult.error)throw founderResult.error;
  const isAdmin=adminResult.data===true;
  return{...profileResult,role:isAdmin?'admin':'user',is_admin:isAdmin,is_founder:founderResult.data===true};
}
function getRoleName(profile){if(profile?.is_admin===true)return'admin';if(profile?.role)return profile.role;return null;}

/* Evita criar uma sessão AAL1 nova quando o mesmo navegador já possui uma
   sessão administrativa válida (inclusive AAL2). A autorização continua sendo
   refeita no servidor; nenhum marcador local concede acesso. */
async function resolveReusableAdminSession(email){
  const session=await resolveSession();
  if(!session?.user)return null;
  if(normalizeIdentityEmail(session.user.email)!==normalizeIdentityEmail(email))return null;
  const profile=await getAdminIdentityProfile(session.user.id);
  if(getRoleName(profile)!=='admin')return null;
  const aal=await getAalState();
  return{session,profile,aal};
}

export async function loginAdmin(email,password){
  const normalizedEmail=String(email??'').trim(),normalizedPassword=String(password??'');
  if(!normalizedEmail||!normalizedPassword)throw new Error('Informe o e-mail e a senha.');
  let reusable=null;
  try{reusable=await resolveReusableAdminSession(normalizedEmail);}catch(error){console.warn('[admin-auth] Sessão existente não pôde ser reutilizada:',error?.message);}
  if(reusable){
    clearHops();
    return{session:reusable.session,user:reusable.session.user,profile:reusable.profile,aal:reusable.aal,needsMfa:reusable.profile.is_founder===true&&reusable.aal.currentLevel !== 'aal2',reusedSession:true};
  }
  const{data,error}=await supabase.auth.signInWithPassword({email:normalizedEmail,password:normalizedPassword});
  if(error)throw error;if(!data.user)throw new Error('Não foi possível identificar o usuário.');
  let profile;try{profile=await getAdminIdentityProfile(data.user.id);}catch(err){console.error('[admin-auth] Erro ao carregar identidade administrativa:',err);throw new Error('Login efetuado, mas não foi possível verificar as permissões. Tente novamente em instantes.');}
  if(getRoleName(profile)!=='admin'){await signOutLocal();throw new Error('Esta conta não possui acesso administrativo.');}
  const aal=await getAalState();clearHops();
  return{...data,profile,aal,needsMfa:profile.is_founder===true&&aal.currentLevel !== 'aal2'};
}

export async function requireAdminIdentity(){
  const session=await resolveSession();
  if(!session?.user){redirectTo('./login.html');throw new Error('Sem sessão administrativa.');}
  let profile;try{profile=await getAdminIdentityProfile(session.user.id);}catch(err){console.error('[admin-auth] Falha ao validar identidade administrativa:',err);if(err.code==='PERFIL_AUSENTE'){await signOutLocal();redirectTo('./login.html');}throw err;}
  if(getRoleName(profile)!=='admin'){await signOutLocal();redirectTo('./login.html');throw new Error('Esta conta não possui acesso administrativo.');}
  const aal=await getAalState();clearHops();return{session,profile,roleName:'admin',aal,isFounder:profile.is_founder===true};
}

/* Guarda do painel:
   Admin modular não usa TOTP. Founder continua obrigado a AAL2 em todas as
   superfícies administrativas porque possui autoridade implícita total. */
export async function requireAdmin(){
  const identity=await requireAdminIdentity();
  if(identity.isFounder&&identity.aal.currentLevel !== 'aal2'){
    redirectTo('./mfa.html');
    const err=new Error('O acesso Founder exige autenticação em dois fatores.');err.code='MFA_REQUIRED';throw err;
  }
  const profile=await getAdminProfile(identity.session.user.id);
  if(getRoleName(profile)!=='admin'){
    if(identity.isFounder){redirectTo('./mfa.html');const err=new Error('A sessão Founder ainda não possui AAL2 válido.');err.code='MFA_REQUIRED';throw err;}
    await signOutLocal();redirectTo('./login.html');throw new Error('A autoridade administrativa desta conta não está ativa.');
  }
  clearHops();return{session:identity.session,profile,roleName:'admin',aal:identity.aal,isFounder:identity.isFounder};
}

export async function redirectIfAdmin(destination='./index.html'){
  if(getHops()>=LOOP_LIMIT){clearHops();return false;}
  let session;try{session=await resolveSession();}catch(err){console.error('[admin-auth] Erro ao ler sessão:',err);return false;}
  if(!session?.user){clearHops();return false;}
  try{const profile=await getAdminIdentityProfile(session.user.id);if(getRoleName(profile)==='admin'){const aal=await getAalState();redirectTo(profile.is_founder&&aal.currentLevel !== 'aal2'?'./mfa.html':destination);return true;}}catch(err){console.error('[admin-auth] Não foi possível verificar o administrador:',err);}
  clearHops();return false;
}

export async function logoutAdmin(){await signOutLocal();clearHops();location.replace('./login.html');}
export{getAalState,getAdminIdentityProfile,getAdminProfile,getRoleName,resolveReusableAdminSession,resolveSession};
