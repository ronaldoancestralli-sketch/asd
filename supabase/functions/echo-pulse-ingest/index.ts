import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false, autoRefreshToken:false } });

const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-echo-pulse-key',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});

function decodeJwtPayload(token:string){
  try{
    const part=token.split('.')[1];if(!part)return null;
    const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized.padEnd(Math.ceil(normalized.length/4)*4,'=');
    return JSON.parse(atob(padded)) as {sub?:string;aal?:string};
  }catch{return null;}
}

function decodeHtml(value=''){
  return String(value).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_m,c)=>String.fromCharCode(Number(c))).replace(/&#x([0-9a-f]+);/gi,(_m,c)=>String.fromCharCode(parseInt(c,16)));
}
function stripHtml(value=''){
  return decodeHtml(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function cleanText(value='',max=800){ const text=stripHtml(value); return text.length>max?`${text.slice(0,max-1).trim()}…`:text; }
function meta(html:string,key:string,property=false){
  const attr=property?'property':'name';
  const first=new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i').exec(html)?.[1];
  if(first) return decodeHtml(first).trim();
  const second=new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["'][^>]*>`,'i').exec(html)?.[1];
  return second?decodeHtml(second).trim():'';
}
function titleOf(html:string){
  const h1=/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  return h1?cleanText(h1,220):(meta(html,'og:title',true)||cleanText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'',220));
}
function assertZeptoUrl(raw:string){
  const url=new URL(raw);
  if(url.protocol!=='https:' || !['zeptolab.com','www.zeptolab.com'].includes(url.hostname.toLowerCase())) throw new Error('Fonte ZeptoLab fora da allowlist');
  return url.toString();
}
function zeptoLinks(html:string){
  const out:Array<{url:string;cardText:string}>=[]; const seen=new Set<string>();
  const pattern=/<a\b[^>]*href=["']([^"']*\/news\/[a-z0-9-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const match of html.matchAll(pattern)){
    const cardText=cleanText(match[2],1200); if(!/\bBullet\s+Echo\b/i.test(cardText)) continue;
    let href=match[1]; if(href.startsWith('/')) href=`https://www.zeptolab.com${href}`;
    try { href=assertZeptoUrl(href).split('#')[0].split('?')[0]; } catch { continue; }
    if(seen.has(href)) continue; seen.add(href); out.push({url:href,cardText});
  }
  return out.slice(0,24);
}
const MONTHS:Record<string,number>={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
function dateOf(text:string){
  const m=String(text).match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if(!m) return null; const d=new Date(Date.UTC(Number(m[3]),MONTHS[m[2].toLowerCase()],Number(m[1]),12)); return Number.isNaN(d.getTime())?null:d.toISOString();
}
function categoryOf(title:string,summary:string){
  const t=`${title} ${summary}`.toLowerCase();
  if(/balance|balanc|patch|nerf|buff/.test(t)) return 'patch';
  if(/event|tournament|championship|competition/.test(t)) return 'event';
  if(/creator|video|stream/.test(t)) return 'creator';
  return 'update';
}
function slugFromUrl(raw:string){ try{return new URL(raw).pathname.split('/').filter(Boolean).pop()||raw;}catch{return raw;} }
function regexEscape(value:string){ return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function objectMetadata(value:unknown){ return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {}; }
async function sha256(value:string){ const bytes=new TextEncoder().encode(value); const hash=await crypto.subtle.digest('SHA-256',bytes); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function fetchHtml(raw:string){
  const url=assertZeptoUrl(raw);
  const res=await fetch(url,{headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'EchoArenaPulse/4.0 (editorial collector; Bullet Echo community)'},redirect:'error'});
  if(!res.ok) throw new Error(`HTTP ${res.status} ao consultar ${url}`);
  return await res.text();
}

async function authorize(req:Request){
  const cronKey=req.headers.get('x-echo-pulse-key')?.trim();
  if(cronKey){
    const {data,error}=await service.from('pulse_runtime_secrets').select('secret_hash').eq('secret_key','cron').maybeSingle();
    return {ok:!error&&!!data?.secret_hash&&(await sha256(cronKey))===data.secret_hash,trigger:'cron' as const,userId:null};
  }
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token||!SUPABASE_ANON_KEY)return {ok:false,trigger:'manual' as const,userId:null};
  const {data:userData,error:userError}=await service.auth.getUser(token);
  if(userError||!userData.user)return {ok:false,trigger:'manual' as const,userId:null};
  const claims=decodeJwtPayload(token);
  if(!claims||claims.sub!==userData.user.id||claims.aal!=='aal2')return {ok:false,trigger:'manual' as const,userId:null};
  const {data:profile,error:profileError}=await service.from('profiles').select('id,is_blocked').eq('id',userData.user.id).maybeSingle();
  if(profileError||!profile||profile.is_blocked===true)return {ok:false,trigger:'manual' as const,userId:null};
  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:isAdmin,error:adminError}=await userClient.rpc('echo_is_admin');
  const ok=!adminError&&isAdmin===true;
  return {ok,trigger:'manual' as const,userId:ok?userData.user.id:null};
}

async function collectZeptoLab(source:any,heroes:any[]){
  const root=assertZeptoUrl(source.feed_url||source.base_url);
  const links=zeptoLinks(await fetchHtml(root));
  const result={seen:0,created:0,updated:0,errors:[] as string[]};
  for(const candidate of links){
    result.seen++;
    try{
      const html=await fetchHtml(candidate.url); const title=titleOf(html); if(!title) throw new Error('Título não identificado');
      const description=meta(html,'description')||meta(html,'og:description',true); const imageUrl=meta(html,'og:image',true)||null; const pageText=stripHtml(html);
      const sourcePublishedAt=dateOf(pageText)||dateOf(candidate.cardText); const summary=cleanText(description||candidate.cardText.replace(/Bullet\s+Echo/ig,''),520); const category=categoryOf(title,summary); const canonicalUrl=candidate.url; const externalId=slugFromUrl(canonicalUrl);
      const {data:existing,error:existingError}=await service.from('pulse_items').select('id,status,metadata').eq('canonical_url',canonicalUrl).maybeSingle(); if(existingError) throw existingError;
      let itemId=existing?.id||null;
      if(!existing){
        const {data:inserted,error:insertError}=await service.from('pulse_items').insert({source_id:source.id,external_id:externalId,canonical_url:canonicalUrl,title,summary:summary||null,source_excerpt:summary||null,image_url:imageUrl,category,status:'inbox',trust_level:source.trust_level,relevance_score:96,source_published_at:sourcePublishedAt,metadata:{collector:'echo-pulse-ingest',collector_version:4,adapter:'zeptolab_news',source_language:'en',editorial_language:null,translation_status:'pending',translation_locked:false,source_title:title,source_summary:summary||null,collected_from:root}}).select('id').single();
        if(insertError) throw insertError; itemId=inserted.id; result.created++;
      } else {
        const previousMetadata=objectMetadata(existing.metadata);
        const translationLocked=previousMetadata.translation_locked===true || previousMetadata.editorial_language==='pt-BR';
        const nextMetadata={...previousMetadata,collector:'echo-pulse-ingest',collector_version:4,adapter:'zeptolab_news',source_language:'en',source_title:title,source_summary:summary||null,collected_from:root};
        if(!('translation_status' in nextMetadata)) nextMetadata.translation_status=translationLocked?'translated':'pending';
        if(!('translation_locked' in nextMetadata)) nextMetadata.translation_locked=translationLocked;
        const patch:Record<string,unknown>={collected_at:new Date().toISOString(),source_published_at:sourcePublishedAt,source_excerpt:summary||null,image_url:imageUrl,trust_level:source.trust_level,relevance_score:96,metadata:nextMetadata};
        if(existing.status==='inbox'&&!translationLocked) Object.assign(patch,{title,summary:summary||null,category});
        const {error:updateError}=await service.from('pulse_items').update(patch).eq('id',existing.id); if(updateError) throw updateError; result.updated++;
      }
      if(itemId){
        const heroText=`${title} ${summary} ${pageText.slice(0,7000)}`;
        const matches=heroes.filter(hero=>{const name=String(hero.name||'').trim(); return name.length>=3&&new RegExp(`(^|[^A-Za-z0-9])${regexEscape(name)}([^A-Za-z0-9]|$)`,'i').test(heroText);});
        if(matches.length){ const {error:linkError}=await service.from('pulse_item_heroes').upsert(matches.map(hero=>({pulse_item_id:itemId,hero_id:hero.id,relation_type:'mentioned'})),{onConflict:'pulse_item_id,hero_id',ignoreDuplicates:true}); if(linkError) throw linkError; }
      }
    }catch(error){ result.errors.push(error instanceof Error?error.message:String(error)); }
  }
  return result;
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json({error:'method_not_allowed'},405);
  const auth=await authorize(req); if(!auth.ok) return json({error:'unauthorized'},401);
  const {data:run,error:runError}=await service.from('pulse_ingestion_runs').insert({trigger_type:auth.trigger,started_by:auth.userId,status:'running'}).select('id').single();
  if(runError) return json({error:'run_create_failed',detail:runError.message},500);
  const totals={sourcesChecked:0,itemsSeen:0,itemsCreated:0,itemsUpdated:0,errors:[] as Array<{source:string;message:string}>};
  try{
    const [{data:sources,error:sourceError},{data:heroes,error:heroError}]=await Promise.all([
      service.from('pulse_sources').select('*').eq('enabled',true).eq('auto_collect',true).order('source_key'),
      service.from('heroes').select('id,name').eq('enabled',true)
    ]);
    if(sourceError) throw sourceError; if(heroError) throw heroError;
    for(const source of sources||[]){
      totals.sourcesChecked++; await service.from('pulse_sources').update({last_checked_at:new Date().toISOString(),last_error:null}).eq('id',source.id);
      try{
        if(source.adapter!=='zeptolab_news') throw new Error(`Adapter automático não autorizado nesta versão: ${source.adapter}`);
        const result=await collectZeptoLab(source,heroes||[]); totals.itemsSeen+=result.seen; totals.itemsCreated+=result.created; totals.itemsUpdated+=result.updated;
        result.errors.forEach(message=>totals.errors.push({source:source.source_key,message}));
        await service.from('pulse_sources').update({last_success_at:new Date().toISOString(),last_error:result.errors.length?`${result.errors.length} item(ns) com erro`:null}).eq('id',source.id);
      }catch(error){ const message=error instanceof Error?error.message:String(error); totals.errors.push({source:source.source_key,message}); await service.from('pulse_sources').update({last_error:message}).eq('id',source.id); }
    }
    const status=totals.errors.length?(totals.itemsCreated+totals.itemsUpdated>0?'partial':'error'):'success';
    await service.from('pulse_ingestion_runs').update({status,finished_at:new Date().toISOString(),sources_checked:totals.sourcesChecked,items_seen:totals.itemsSeen,items_created:totals.itemsCreated,items_updated:totals.itemsUpdated,error_count:totals.errors.length,details:{collector_version:4,errors:totals.errors.slice(0,30)}}).eq('id',run.id);
    return json({ok:status!=='error',runId:run.id,status,...totals});
  }catch(error){
    const message=error instanceof Error?error.message:String(error); await service.from('pulse_ingestion_runs').update({status:'error',finished_at:new Date().toISOString(),error_count:1,details:{collector_version:4,fatal:message}}).eq('id',run.id); return json({error:'ingestion_failed',detail:message,runId:run.id},500);
  }
});
