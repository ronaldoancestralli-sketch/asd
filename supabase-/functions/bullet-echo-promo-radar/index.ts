import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth:{ persistSession:false, autoRefreshToken:false }
});

const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-echo-promo-radar-key',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
const json = (body,status=200) => new Response(JSON.stringify(body), {
  status,
  headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});

function decodeJwtPayload(token=''){
  try{
    const part=token.split('.')[1];
    if(!part)return null;
    const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
    const padded=normalized.padEnd(Math.ceil(normalized.length/4)*4,'=');
    return JSON.parse(atob(padded));
  }catch{return null;}
}

async function sha256(value=''){
  const bytes=new TextEncoder().encode(String(value));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function decodeEntities(value=''){
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_m,n)=>String.fromCodePoint(parseInt(n,16)));
}

function stripHtml(value=''){
  return decodeEntities(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/p\s*>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .replace(/[\t\r ]+/g,' ')
    .replace(/\n\s+/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

function cleanText(value='',max=12000){
  const text=stripHtml(value).replace(/\s+/g,' ').trim();
  return text.length>max?text.slice(0,max):text;
}

function meta(html,key,property=false){
  const attr=property?'property':'name';
  const first=new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i').exec(html)?.[1];
  if(first)return decodeEntities(first).trim();
  const second=new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["'][^>]*>`,'i').exec(html)?.[1];
  return second?decodeEntities(second).trim():'';
}

function titleOf(html){
  return meta(html,'og:title',true)
    || cleanText(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'',220)
    || cleanText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'',220);
}

function isoDate(value){
  if(!value)return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}

function publishedAtOf(html){
  const candidates=[
    meta(html,'article:published_time',true),
    meta(html,'date',false),
    /["']datePublished["']\s*:\s*["']([^"']+)["']/i.exec(html)?.[1],
    /<time\b[^>]*datetime=["']([^"']+)["']/i.exec(html)?.[1]
  ];
  for(const candidate of candidates){
    const parsed=isoDate(candidate);
    if(parsed)return parsed;
  }
  return null;
}

function canonicalize(raw,base){
  const url=new URL(raw,base);
  url.hash='';
  for(const key of [...url.searchParams.keys()]){
    if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key))url.searchParams.delete(key);
  }
  return url.toString();
}

function assertSourceUrl(source,raw){
  const url=new URL(raw);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:')throw new Error('source_non_https');

  switch(source.adapter){
    case 'telegram_public':
      if(host!=='t.me'||!/^\/(s\/)?bulletecho(?:\/|$)/i.test(url.pathname))throw new Error('telegram_outside_allowlist');
      break;
    case 'youtube_feed':
      if(!['www.youtube.com','youtube.com','youtu.be'].includes(host))throw new Error('youtube_outside_allowlist');
      if(host!=='youtu.be'&&!(/^\/@BulletEcho(?:\/|$)/i.test(url.pathname)||/^\/feeds\/videos\.xml$/i.test(url.pathname)||/^\/watch$/i.test(url.pathname)||/^\/channel\/UC/i.test(url.pathname)))throw new Error('youtube_path_outside_allowlist');
      break;
    case 'helpshift_recent':
      if(host!=='zepto.helpshift.com'||!new RegExp(`^/hc/${source.language}/10-bullet-echo(?:/|$)`,'i').test(url.pathname))throw new Error('helpshift_outside_allowlist');
      break;
    case 'zeptolab_news':
      if(!['zeptolab.com','www.zeptolab.com'].includes(host)||!/^\/news(?:\/|$)/i.test(url.pathname))throw new Error('zeptolab_news_outside_allowlist');
      break;
    case 'page_snapshot':
      if(source.source_key==='official_store'){
        if(host!=='shop.bulletecho.game')throw new Error('store_outside_allowlist');
      }else if(source.source_key==='zeptolab_game'){
        if(!['zeptolab.com','www.zeptolab.com'].includes(host)||!/^\/games\/bullet-echo(?:\/|$)/i.test(url.pathname))throw new Error('zeptolab_game_outside_allowlist');
      }else throw new Error('page_snapshot_not_allowlisted');
      break;
    default:
      throw new Error(`adapter_not_fetchable:${source.adapter}`);
  }
  return url.toString();
}

async function fetchText(source,raw,accept='text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.7'){
  const target=assertSourceUrl(source,raw);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetch(target,{
      headers:{
        Accept:accept,
        'User-Agent':'EchoArenaPromoRadar/1.0 (official-source collector; Bullet Echo)'
      },
      signal:controller.signal,
      redirect:'follow'
    });
    assertSourceUrl(source,response.url||target);
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    const text=await response.text();
    if(text.length>2_000_000)throw new Error('source_payload_too_large');
    return text;
  }finally{clearTimeout(timeout);}
}

async function authorize(req){
  const cronKey=req.headers.get('x-echo-promo-radar-key')?.trim();
  if(cronKey){
    const {data,error}=await service.from('promo_radar_runtime_secrets').select('secret_hash').eq('secret_key','cron').maybeSingle();
    const ok=!error&&!!data?.secret_hash&&(await sha256(cronKey))===data.secret_hash;
    return {ok,trigger:'cron',userId:null};
  }

  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token||!SUPABASE_ANON_KEY)return {ok:false,trigger:'manual',userId:null};
  const {data:userData,error:userError}=await service.auth.getUser(token);
  if(userError||!userData.user)return {ok:false,trigger:'manual',userId:null};
  const claims=decodeJwtPayload(token);
  if(!claims||claims.sub!==userData.user.id||claims.aal!=='aal2')return {ok:false,trigger:'manual',userId:null};

  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
    global:{headers:{Authorization:`Bearer ${token}`}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:isAdmin,error:adminError}=await userClient.rpc('echo_is_admin');
  const ok=!adminError&&isAdmin===true;
  return {ok,trigger:'manual',userId:ok?userData.user.id:null};
}

function telegramItems(source,html){
  const segments=String(html).split(/<div class="tgme_widget_message_wrap/i).slice(1,35);
  const items=[];
  for(const segment of segments){
    const post=/data-post=["']bulletecho\/(\d+)["']/i.exec(segment)?.[1];
    if(!post)continue;
    const body=/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i.exec(segment)?.[1]
      || /<div class="tgme_widget_message_caption[^>]*>([\s\S]*?)<\/div>/i.exec(segment)?.[1]
      || '';
    const text=cleanText(body,9000);
    if(!text)continue;
    const publishedAt=isoDate(/<time\b[^>]*datetime=["']([^"']+)["']/i.exec(segment)?.[1]);
    items.push({externalId:`telegram:${post}`,canonicalUrl:`https://t.me/bulletecho/${post}`,title:text.slice(0,160),text,publishedAt});
  }
  return items;
}

function xmlValue(block,tag){
  const escaped=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return decodeEntities(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`,'i').exec(block)?.[1]||'').trim();
}

async function youtubeItems(source){
  const channelHtml=await fetchText(source,source.base_url);
  const channelId=/["']channelId["']\s*:\s*["'](UC[A-Za-z0-9_-]+)["']/i.exec(channelHtml)?.[1]
    || /["']externalId["']\s*:\s*["'](UC[A-Za-z0-9_-]+)["']/i.exec(channelHtml)?.[1]
    || /\/channel\/(UC[A-Za-z0-9_-]+)/i.exec(channelHtml)?.[1];
  if(!channelId)throw new Error('youtube_channel_id_not_found');
  const feed=`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const xml=await fetchText(source,feed,'application/atom+xml,application/xml,text/xml;q=0.9');
  const items=[];
  for(const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)){
    const block=match[1];
    const videoId=xmlValue(block,'yt:videoId');
    if(!videoId)continue;
    const title=xmlValue(block,'title');
    const description=xmlValue(block,'media:description');
    items.push({externalId:`youtube:${videoId}`,canonicalUrl:`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,title:title.slice(0,180),text:cleanText(`${title}\n${description}`,10000),publishedAt:isoDate(xmlValue(block,'published'))});
    if(items.length>=20)break;
  }
  return items;
}

async function helpshiftItems(source){
  const root=await fetchText(source,source.base_url);
  const links=[];
  const seen=new Set();
  const hrefPattern=new RegExp(`href=["']([^"']*/hc/${source.language}/10-bullet-echo/faq/[^"'#?]+/?(?:\\?[^"']*)?)["']`,'gi');
  for(const match of root.matchAll(hrefPattern)){
    try{
      const url=canonicalize(match[1],source.base_url).split('?')[0];
      assertSourceUrl(source,url);
      if(!seen.has(url)){seen.add(url);links.push(url);}
    }catch{/* ignore */}
    if(links.length>=8)break;
  }
  const items=[];
  for(const url of links){
    try{
      const html=await fetchText(source,url);
      const title=titleOf(html);
      const text=cleanText(html,14000);
      const faq=/\/faq\/([^/?#]+)/i.exec(url)?.[1]||url;
      items.push({externalId:`helpshift:${source.language}:${faq}`,canonicalUrl:url,title:title.slice(0,180),text,publishedAt:publishedAtOf(html)});
    }catch(error){
      items.push({externalId:`error:${await sha256(url)}`,canonicalUrl:url,title:'',text:'',publishedAt:null,error:error instanceof Error?error.message:String(error)});
    }
  }
  return items;
}

async function zeptolabNewsItems(source){
  const root=await fetchText(source,source.base_url);
  const links=[];
  const seen=new Set();
  for(const match of root.matchAll(/<a\b[^>]*href=["']([^"']*\/news\/[a-z0-9-]+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    try{
      const context=cleanText(match[2],500);
      if(!/bullet\s+echo/i.test(context))continue;
      const url=canonicalize(match[1],source.base_url).split('?')[0];
      assertSourceUrl(source,url);
      if(!seen.has(url)){seen.add(url);links.push(url);}
    }catch{/* ignore */}
    if(links.length>=12)break;
  }
  const items=[];
  for(const url of links){
    const html=await fetchText(source,url);
    const title=titleOf(html);
    const text=cleanText(html,14000);
    if(!/bullet\s+echo/i.test(`${title} ${text.slice(0,5000)}`))continue;
    items.push({externalId:`zeptolab:${url.split('/').filter(Boolean).pop()}`,canonicalUrl:url,title:title.slice(0,180),text,publishedAt:publishedAtOf(html)});
  }
  return items;
}

async function pageSnapshotItems(source){
  const html=await fetchText(source,source.base_url);
  return [{externalId:`page:${source.source_key}`,canonicalUrl:source.base_url,title:titleOf(html).slice(0,180),text:cleanText(html,14000),publishedAt:publishedAtOf(html),rootHash:await sha256(html)}];
}

async function collectSource(source){
  if(source.adapter==='telegram_public')return telegramItems(source,await fetchText(source,source.base_url));
  if(source.adapter==='youtube_feed')return await youtubeItems(source);
  if(source.adapter==='helpshift_recent')return await helpshiftItems(source);
  if(source.adapter==='zeptolab_news')return await zeptolabNewsItems(source);
  if(source.adapter==='page_snapshot')return await pageSnapshotItems(source);
  throw new Error(`adapter_not_authorized:${source.adapter}`);
}

const CONTEXT_PATTERNS=[/promo\s*-?\s*code/giu,/promocode/giu,/redeem(?:able)?\s+code/giu,/gift\s+code/giu,/промо\s*-?\s*код/giu,/промокод/giu,/c[oó]digo\s+promocional/giu,/c[oó]digo\s+de\s+promoci[oó]n/giu,/code\s+promo(?:tionnel)?/giu,/aktionscode/giu];
const BLOCKED_TOKENS=new Set(['BULLETECHO','BULLET','ECHO','PROMOCODE','PROMO','CODE','REDEEM','GIVEAWAY','GIVEAWAYS','DISCORD','TELEGRAM','YOUTUBE','INSTAGRAM','FACEBOOK','TWITTER','UPDATE','SEASON','AVAILABLE','OFFICIAL','COMMUNITY','FOLLOW','SUBSCRIBE','ANDROID','IPHONE','ZEPTOLAB']);

function tokenLooksLikeCode(token){
  const value=String(token||'').replace(/^[#@]+/,'').trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{3,31}$/.test(value))return false;
  if(/^\d+$/.test(value))return false;
  if(BLOCKED_TOKENS.has(value.toUpperCase()))return false;
  const hasDigit=/\d/.test(value);
  const allCaps=value===value.toUpperCase()&&/[A-Z]/.test(value);
  return hasDigit||allCaps;
}

function candidateContext(text,start,end){return text.slice(Math.max(0,start-170),Math.min(text.length,end+220)).replace(/\s+/g,' ').trim();}
function extractCandidates(text,title=''){
  const source=String(text||'').replace(/https?:\/\/\S+/gi,' ');
  const found=new Map();
  for(const pattern of CONTEXT_PATTERNS){
    pattern.lastIndex=0;
    for(const match of source.matchAll(pattern)){
      const index=match.index??0;
      const before=source.slice(Math.max(0,index-100),index);
      const after=source.slice(index+match[0].length,index+match[0].length+115);
      const windows=[{value:after,side:'after'},{value:before,side:'before'}];
      for(const window of windows){
        const tokens=window.value.match(/[A-Za-z0-9][A-Za-z0-9_-]{3,31}/g)||[];
        for(const token of tokens){
          if(!tokenLooksLikeCode(token))continue;
          const normalized=token.toUpperCase();
          const distance=window.side==='after'?window.value.indexOf(token):window.value.length-window.value.lastIndexOf(token);
          if(distance>90)continue;
          const confidence=window.side==='after'?(distance<=45?100:99):(distance<=45?99:98);
          const existing=found.get(normalized);
          const context=candidateContext(source,index,index+match[0].length);
          if(!existing||confidence>existing.confidence)found.set(normalized,{code:token,confidence,context});
        }
      }
    }
  }
  const titleText=String(title||'');
  for(const candidate of found.values())if(titleText.toUpperCase().includes(candidate.code.toUpperCase()))candidate.confidence=Math.max(candidate.confidence,100);
  return [...found.values()].sort((a,b)=>b.confidence-a.confidence||a.code.localeCompare(b.code));
}

function extractReward(text,code){
  const upper=String(text||'');
  const idx=upper.toUpperCase().indexOf(String(code).toUpperCase());
  const window=idx>=0?upper.slice(Math.max(0,idx-180),idx+String(code).length+220):upper.slice(0,350);
  const match=/\b(\d[\d., ]{0,7})\s*(bucks?|joker\s+cards?|cards?|coins?|gold|nuts?|batter(?:y|ies)|tickets?|бакс(?:ов|ы)?|карт(?:ы|очек)?|монет(?:ы|ок)?)\b/i.exec(window);
  return match?`${match[1].trim()} ${match[2].trim()}`.slice(0,120):null;
}
function endOfUtcDay(year,month,day){const date=new Date(Date.UTC(year,month-1,day,23,59,59));return Number.isNaN(date.getTime())?null:date.toISOString();}
function extractExpiry(text){
  const source=String(text||'');
  let match=/(?:expires?|valid\s+until|available\s+until|до)\s*(?:on\s*)?(\d{4})-(\d{1,2})-(\d{1,2})/iu.exec(source);
  if(match)return endOfUtcDay(Number(match[1]),Number(match[2]),Number(match[3]));
  match=/(?:expires?|valid\s+until|available\s+until|до)\s*(?:on\s*)?(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/iu.exec(source);
  if(match)return endOfUtcDay(Number(match[3]),Number(match[2]),Number(match[1]));
  return null;
}
function freshEnoughForProcessing(publishedAt){if(!publishedAt)return true;const value=new Date(publishedAt).getTime();return Number.isFinite(value)&&value>=Date.now()-30*24*60*60*1000&&value<=Date.now()+15*60*1000;}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)return json({error:'server_not_configured'},500);
  const auth=await authorize(req);
  if(!auth.ok)return json({error:'unauthorized'},401);
  const MAX_REQUEST_BODY_BYTES=64*1024;
  const contentLength=Number(req.headers.get('content-length')||0);
  if(Number.isFinite(contentLength)&&contentLength>MAX_REQUEST_BODY_BYTES)return json({error:'request_too_large'},413);
  let payload={};
  try{
    const rawBody=await req.text();
    if(new TextEncoder().encode(rawBody).byteLength>MAX_REQUEST_BODY_BYTES)return json({error:'request_too_large'},413);
    if(rawBody.trim())payload=JSON.parse(rawBody);
  }catch{return json({error:'invalid_json'},400);}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return json({error:'invalid_payload'},400);
  const dryRun=auth.trigger==='cron'?payload?.dry_run===true:payload?.commit!==true;
  const {data:run,error:runError}=await service.from('promo_radar_runs').insert({trigger_type:auth.trigger,dry_run:dryRun,started_by:auth.userId,status:'running'}).select('id').single();
  if(runError)return json({error:'run_create_failed',detail:runError.message},500);
  const totals={sourcesChecked:0,itemsSeen:0,candidatesSeen:0,campaignsCreated:0,campaignsPublished:0,campaignsReused:0,campaignsExpired:0,errors:[],candidates:[]};
  try{
    if(!dryRun){const {data:expired,error:maintenanceError}=await service.rpc('promo_radar_maintenance');if(maintenanceError)throw maintenanceError;totals.campaignsExpired=Number(expired||0);}
    const {data:sources,error:sourceError}=await service.from('promo_radar_sources').select('id,source_key,source_name,base_url,adapter,language,priority,auto_publish,min_auto_confidence,max_source_age_hours,max_auto_live_hours,last_content_hash').eq('enabled',true).eq('auto_collect',true).order('priority',{ascending:false});
    if(sourceError)throw sourceError;
    for(const source of sources||[]){
      totals.sourcesChecked++;
      await service.from('promo_radar_sources').update({last_checked_at:new Date().toISOString(),last_error:null}).eq('id',source.id);
      try{
        const items=await collectSource(source);
        let sourceRootHash=null;
        for(const item of items){
          if(item.error){totals.errors.push({source:source.source_key,message:item.error});continue;}
          totals.itemsSeen++;
          if(item.rootHash)sourceRootHash=item.rootHash;
          if(!freshEnoughForProcessing(item.publishedAt))continue;
          const candidates=extractCandidates(item.text,item.title);
          if(!candidates.length)continue;
          totals.candidatesSeen+=candidates.length;
          const candidateCount=candidates.length;
          const expiry=extractExpiry(item.text);
          const contentHash=await sha256(item.text);
          for(const candidate of candidates){
            const reward=extractReward(item.text,candidate.code);
            const summary={source:source.source_key,sourceName:source.source_name,url:item.canonicalUrl,title:item.title,publishedAt:item.publishedAt,code:dryRun?candidate.code:'[stored-private]',confidence:candidate.confidence,candidateCount,reward,expiresAt:expiry,decision:dryRun?'dry_run':null};
            if(dryRun){totals.candidates.push(summary);continue;}
            const {data:result,error:ingestError}=await service.rpc('promo_radar_ingest_candidate',{p_source_key:source.source_key,p_external_id:item.externalId,p_canonical_url:item.canonicalUrl,p_source_title:item.title||'Código promocional oficial — Bullet Echo',p_source_excerpt:candidate.context,p_source_published_at:item.publishedAt,p_code:candidate.code,p_reward:reward,p_expires_at:expiry,p_confidence:candidate.confidence,p_candidate_count:candidateCount,p_content_hash:contentHash});
            if(ingestError){totals.errors.push({source:source.source_key,message:ingestError.message,url:item.canonicalUrl});continue;}
            const action=result?.action||'unknown';summary.decision=action;totals.candidates.push(summary);
            const created=result?.created===true;if(created)totals.campaignsCreated++;
            if(action==='published'){totals.campaignsPublished++;if(!created)totals.campaignsReused++;}else if(String(action).startsWith('existing'))totals.campaignsReused++;
          }
        }
        await service.from('promo_radar_sources').update({last_success_at:new Date().toISOString(),last_error:null,...(sourceRootHash?{last_content_hash:sourceRootHash}:{})}).eq('id',source.id);
      }catch(error){const message=error instanceof Error?error.message:String(error);totals.errors.push({source:source.source_key,message});await service.from('promo_radar_sources').update({last_error:message}).eq('id',source.id);}
    }
    const status=totals.errors.length?(totals.candidatesSeen>0?'partial':'error'):'success';
    await service.from('promo_radar_runs').update({status,finished_at:new Date().toISOString(),sources_checked:totals.sourcesChecked,items_seen:totals.itemsSeen,candidates_seen:totals.candidatesSeen,campaigns_created:totals.campaignsCreated,campaigns_published:totals.campaignsPublished,campaigns_reused:totals.campaignsReused,campaigns_expired:totals.campaignsExpired,error_count:totals.errors.length,details:{collector_version:1,dry_run:dryRun,errors:totals.errors.slice(0,30)}}).eq('id',run.id);
    return json({ok:status!=='error',runId:run.id,status,dryRun,sourcesChecked:totals.sourcesChecked,itemsSeen:totals.itemsSeen,candidatesSeen:totals.candidatesSeen,campaignsCreated:totals.campaignsCreated,campaignsPublished:totals.campaignsPublished,campaignsReused:totals.campaignsReused,campaignsExpired:totals.campaignsExpired,errors:totals.errors.slice(0,20),candidates:auth.trigger==='manual'?totals.candidates.slice(0,50):undefined});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await service.from('promo_radar_runs').update({status:'error',finished_at:new Date().toISOString(),error_count:1,details:{collector_version:1,dry_run:dryRun,fatal:message}}).eq('id',run.id);
    return json({error:'promo_radar_failed',detail:message,runId:run.id},500);
  }
});
