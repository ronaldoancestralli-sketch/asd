import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromoCodeController, isExpired, revealedRow } from '../js/promo-gift-controller.mjs';
import { escapeHtml, safeHttps, giftMarkupFor, createPromoGiftView } from '../js/promo-gift-view.mjs';

const CAMPAIGN = {id:'campaign-one',game:'Bullet Echo',title:'Presente da comunidade',banner_label:'CÓDIGO PROMOCIONAL',banner_message:'Curta para revelar.',source_name:'Publicação oficial',source_url:'https://example.org/promo',expires_at:null};
const SESSION = {user:{id:'account-one'}};
const row = (id = CAMPAIGN.id) => ({promo_id:id,code:'TEST-CODE',liked_at:'2030-01-01T00:00:00Z'});
const flush = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
function pending() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; }

function clock() {
  let time = Date.parse('2030-01-01T00:00:00Z');
  let id = 0;
  const tasks = new Map();
  return {
    now:() => time,
    pendingCount:() => tasks.size,
    setTimeout(fn, delay = 0) { const key = ++id; tasks.set(key,{fn,at:time+delay}); return key; },
    clearTimeout(key) { tasks.delete(key); },
    async advance(ms = 0) {
      const end = time + ms;
      for (;;) {
        const next = [...tasks.entries()].filter(([,x]) => x.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
        if (!next) break;
        time = next[1].at; tasks.delete(next[0]); next[1].fn(); await flush();
      }
      time = end; await flush();
    }
  };
}

function fixture({session = SESSION,campaign = CAMPAIGN,href = 'https://example.org/index.html',aal = 'aal2',admin = true} = {}) {
  const timer = clock();
  const saved = new Map();
  const handlers = new Map();
  const calls = [];
  const queries = [];
  const views = [];
  const events = new Map();
  let sessionValue = session;
  let campaignValue = campaign;
  let authHandler;
  let loginClicks = 0;
  const win = {
    ...timer, innerWidth:1200,
    location:{href,pathname:new URL(href).pathname,assign(value){this.href=value;}},
    history:{state:null,replaceState(_,__,value){win.location.href = new URL(value, win.location.href).href;}},
    sessionStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},
    addEventListener:(name,fn)=>events.set(name,fn), removeEventListener:name=>events.delete(name)
  };
  const doc = {visibilityState:'visible',getElementById:id=>id==='login-btn'?{textContent:'Entrar',click(){loginClicks+=1;}}:null,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const client = {
    auth:{getSession:async()=>({data:{session:sessionValue}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal}})},onAuthStateChange(fn){authHandler=fn;return {data:{subscription:{unsubscribe(){authHandler=null;}}}};}},
    rpc(name,args){calls.push({name,args});return handlers.has(name)?handlers.get(name)(args):Promise.resolve({data:name==='echo_is_admin'?admin:[]});},
    from(name){
      const query = {table:name,filters:[]}; queries.push(query);
      const chain = {select(value){query.select=value;return chain;},eq(key,value){query.filters.push([key,value]);return chain;},or(value){query.filters.push(['or',value]);return chain;},order(){return chain;},limit(value){query.limit=value;return chain;},maybeSingle(){return Promise.resolve({data:campaignValue});}};
      return chain;
    }
  };
  function viewFactory(promo, options) {
    const view = {promo,options,opened:false,code:'',state:'checking',celebrations:0,notice:'',destroyed:false,
      open(){this.opened=true;return true;},isOpen(){return this.opened;},
      minimize({remember=true}={}){this.opened=false;if(remember)options.onMinimize();},
      lock(opts={}){this.code='';this.state=opts.checking?'checking':'locked';this.notice=opts.notice||'';},
      waiting(){this.state='waiting';},error(text,opts){this.code='';this.state='error';this.notice=text;this.blocked=opts?.blocked;},
      message(text){this.notice=text;},expire(){this.code='';this.state='expired';},
      reveal(code,{celebrate=false}={}){this.code=code;this.state='revealed';if(celebrate)this.celebrations+=1;},
      suspend(){this.suspended=true;},destroy(){this.code='';this.destroyed=true;this.opened=false;}};
    views.push(view);return view;
  }
  const controller = createPromoCodeController({client,viewFactory,win,doc,now:timer.now});
  return {controller,client,views,calls,queries,saved,handlers,win,doc,timer,events,
    get view(){return views.at(-1);},get loginClicks(){return loginClicks;},
    setCampaign(value){campaignValue=value;},
    auth(event,value){sessionValue=value;authHandler?.(event,value);},
    writes:()=>calls.filter(x=>x.name==='promo_like_and_reveal')};
}

test('public lookup selects only metadata and retains game, publication, verification and time filters', async () => {
  const f=fixture({session:null});await f.controller.start();
  assert.equal(f.view.opened,true);assert.equal(f.writes().length,0);
  assert.equal(f.queries[0].select.split(',').includes('code'),false);
  assert.deepEqual(f.queries[0].filters.slice(0,4),[['game','Bullet Echo'],['published',true],['verification_status','verified'],['status','active']]);
  assert.match(f.queries[0].filters[4][1],/^starts_at\.is\.null,starts_at\.lte\./);
  assert.match(f.queries[0].filters[5][1],/^expires_at\.is\.null,expires_at\.gt\./);
  f.controller.destroy();
});

test('an URL or a legacy pending ID never creates a like', async () => {
  const f=fixture({href:'https://example.org/index.html?promo=campaign-one'});
  f.saved.set('echo-promo-pending',CAMPAIGN.id);
  await f.controller.start();assert.equal(f.writes().length,0);assert.equal(f.saved.has('echo-promo-pending'),false);f.controller.destroy();
});

test('anonymous action closes the gift before login; successful login still requires an explicit like', async () => {
  const f=fixture({session:null});await f.controller.start();await f.controller.activate();
  assert.equal(f.loginClicks,1);assert.equal(f.view.opened,false);assert.equal(f.writes().length,0);
  f.auth('SIGNED_IN',SESSION);await f.timer.advance();
  assert.equal(f.view.opened,true);assert.equal(f.writes().length,0);assert.equal(f.view.code,'');f.controller.destroy();
});

test('double activation makes one request and only celebrates after the server returns a matching code', async () => {
  const f=fixture();const request=pending();f.handlers.set('promo_like_and_reveal',()=>request.promise);
  await f.controller.start();const first=f.controller.activate();await f.controller.activate();
  assert.equal(f.writes().length,1);assert.equal(f.view.celebrations,0);assert.equal(f.view.code,'');
  request.resolve({data:[row()]});assert.equal(await first,true);assert.equal(f.view.celebrations,1);assert.equal(f.view.code,'TEST-CODE');
  await f.controller.activate();assert.equal(f.writes().length,1);assert.equal([...f.saved.values()].some(value=>value.includes('TEST-CODE')),false);f.controller.destroy();
});

test('an existing like restores the code without replaying the reward or writing another like', async () => {
  const f=fixture();f.handlers.set('promo_reveal_if_liked',async()=>({data:[row()]}));await f.controller.start();
  assert.equal(f.view.code,'TEST-CODE');assert.equal(f.view.celebrations,0);await f.controller.activate();assert.equal(f.writes().length,0);f.controller.destroy();
});

test('a rejected request leaves a retryable gift and never celebrates', async () => {
  const f=fixture();f.handlers.set('promo_like_and_reveal',async()=>{throw new Error('network');});await f.controller.start();
  assert.equal(await f.controller.activate(),false);assert.equal(f.view.state,'error');assert.equal(f.view.celebrations,0);
  f.handlers.set('promo_like_and_reveal',async()=>({data:[row()]}));assert.equal(await f.controller.activate(),true);assert.equal(f.writes().length,2);f.controller.destroy();
});

test('a timeout unlocks retry without fabricating success', async () => {
  const f=fixture();f.handlers.set('promo_like_and_reveal',()=>new Promise(()=>{}));await f.controller.start();
  const request=f.controller.activate();await f.timer.advance(12000);assert.equal(await request,false);assert.equal(f.view.state,'error');assert.equal(f.view.celebrations,0);f.controller.destroy();
});

test('blocked accounts never reveal and the UI disables the action', async () => {
  const f=fixture();f.handlers.set('promo_like_and_reveal',async()=>({error:{message:'promo_user_blocked'}}));await f.controller.start();
  await f.controller.activate();assert.equal(f.view.blocked,true);assert.equal(f.view.code,'');assert.equal(f.view.celebrations,0);f.controller.destroy();
});

test('a missing, oversized or mismatched payload never reveals a code', async () => {
  for(const data of [null,[],[{code:'x',promo_id:'other'}],[{code:' ',promo_id:CAMPAIGN.id}],[{code:'x'.repeat(161),promo_id:CAMPAIGN.id}]]){
    const f=fixture();f.handlers.set('promo_like_and_reveal',async()=>({data}));await f.controller.start();await f.controller.activate();assert.equal(f.view.code,'');assert.equal(f.view.celebrations,0);f.controller.destroy();
  }
});

test('logout immediately clears an already revealed code', async () => {
  const f=fixture();f.handlers.set('promo_reveal_if_liked',async()=>({data:[row()]}));await f.controller.start();
  f.auth('SIGNED_OUT',null);assert.equal(f.view.code,'');assert.equal(f.view.state,'locked');await f.timer.advance();assert.equal(f.view.code,'');f.controller.destroy();
});

test('a response arriving after logout is discarded', async () => {
  const f=fixture();const result=pending();f.handlers.set('promo_like_and_reveal',()=>result.promise);await f.controller.start();
  const action=f.controller.activate();f.auth('SIGNED_OUT',null);result.resolve({data:[row()]});await action;await f.timer.advance();
  assert.equal(f.view.code,'');assert.equal(f.view.celebrations,0);f.controller.destroy();
});

test('an old account cannot reveal into a new account session', async () => {
  const f=fixture();const result=pending();f.handlers.set('promo_like_and_reveal',()=>result.promise);await f.controller.start();
  const action=f.controller.activate();f.auth('SIGNED_IN',{user:{id:'account-two'}});result.resolve({data:[row()]});await action;await f.timer.advance();
  assert.equal(f.view.code,'');assert.equal(f.view.celebrations,0);f.controller.destroy();
});

test('campaign replacement discards the previous request and all of its effects', async () => {
  const f=fixture();const result=pending();f.handlers.set('promo_like_and_reveal',()=>result.promise);await f.controller.start();
  const old=f.view;const action=f.controller.activate();f.setCampaign({...CAMPAIGN,id:'campaign-two'});await f.controller.load();result.resolve({data:[row()]});await action;
  assert.equal(old.destroyed,true);assert.equal(f.view.code,'');assert.equal(f.view.promo.id,'campaign-two');assert.equal(f.view.celebrations,0);f.controller.destroy();
});

test('campaign expiry scrubs the code and prevents another write', async () => {
  const expires_at=new Date(Date.parse('2030-01-01T00:00:00Z')+1000).toISOString();
  const f=fixture({campaign:{...CAMPAIGN,expires_at}});f.handlers.set('promo_reveal_if_liked',async()=>({data:[row()]}));await f.controller.start();
  await f.timer.advance(1010);assert.equal(f.view.code,'');assert.equal(f.view.state,'expired');await f.controller.activate();assert.equal(f.writes().length,0);f.controller.destroy();
});

test('a response crossing the expiry boundary is discarded', async () => {
  const f=fixture({campaign:{...CAMPAIGN,expires_at:'2030-01-01T00:00:01Z'}});const result=pending();f.handlers.set('promo_like_and_reveal',()=>result.promise);await f.controller.start();
  const action=f.controller.activate();await f.timer.advance(1010);result.resolve({data:[row()]});await action;assert.equal(f.view.code,'');assert.equal(f.view.celebrations,0);f.controller.destroy();
});

test('there is no invented gift when no campaign exists or the campaign already expired', async () => {
  for(const campaign of [null,{...CAMPAIGN,expires_at:'2000-01-01T00:00:00Z'}]){
    const f=fixture({campaign});await f.controller.start();assert.equal(f.views.length,0);assert.equal(f.writes().length,0);f.controller.destroy();
  }
});

test('minimizing persists only the UI preference and keeps a refreshed gift minimized', async () => {
  const f=fixture();await f.controller.start();f.view.minimize();await f.controller.load();
  assert.equal(f.view.opened,false);assert.equal(f.saved.get('echo-promo-minimized:campaign-one'),'1');assert.equal(f.writes().length,0);f.controller.destroy();
});

test('unavailable sessionStorage does not break the flow or persist a secret', async () => {
  const f=fixture();f.win.sessionStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  f.handlers.set('promo_like_and_reveal',async()=>({data:[row()]}));await f.controller.start();f.view.minimize();assert.equal(await f.controller.activate(),true);f.controller.destroy();
});

test('AAL1 or a non-admin cannot enable the administrative preview', async () => {
  for(const opts of [{aal:'aal1',admin:true},{aal:'aal2',admin:false},{session:null}]){
    const f=fixture({...opts,href:'https://example.org/index.html?promo_preview=1'});await f.controller.start();assert.equal(f.view.promo.__preview,undefined);assert.equal(f.writes().length,0);assert.equal(new URL(f.win.location.href).searchParams.has('promo_preview'),false);f.controller.destroy();
  }
});

test('AAL2 admin preview revalidates permissions, shows a fake code and never writes likes', async () => {
  const f=fixture({href:'https://example.org/index.html?promo_preview=1'});await f.controller.start();assert.equal(f.view.promo.__preview,true);
  await f.controller.activate();assert.equal(f.view.code,'PREVIA-NAO-REAL');assert.equal(f.writes().length,0);assert.equal(f.calls.filter(x=>x.name==='echo_is_admin').length,2);
  f.auth('SIGNED_OUT',null);assert.equal(f.views[0].code,'');assert.equal(f.views[0].destroyed,true);await f.timer.advance();assert.equal(f.view.promo.__preview,undefined);f.controller.destroy();
});

test('logout during preview authorization invalidates the preview result', async () => {
  const f=fixture({href:'https://example.org/index.html?promo_preview=1'});await f.controller.start();
  const result=pending();f.handlers.set('echo_is_admin',()=>result.promise);const action=f.controller.activate();await flush();f.auth('SIGNED_OUT',null);result.resolve({data:true});await action;await f.timer.advance();
  assert.equal(f.views.every(v=>v.code===''),true);assert.equal(f.writes().length,0);f.controller.destroy();
});

test('auth callbacks defer RPCs and ordinary same-account events do not replay the effect', async () => {
  const f=fixture();await f.controller.start();const before=f.calls.length;f.auth('SIGNED_IN',{user:{id:'account-two'}});assert.equal(f.calls.length,before);
  await f.timer.advance();assert.equal(f.calls.length,before+1);f.auth('SIGNED_IN',{user:{id:'account-two'}});await f.timer.advance();assert.equal(f.calls.length,before+1);f.controller.destroy();
});

test('destroy drops late requests and removes lifecycle subscriptions', async () => {
  const f=fixture();const result=pending();f.handlers.set('promo_like_and_reveal',()=>result.promise);await f.controller.start();const action=f.controller.activate();
  const view=f.view;f.controller.destroy();result.resolve({data:[row()]});await action;assert.equal(view.code,'');assert.equal(view.destroyed,true);assert.equal(f.events.size,0);
});

test('text and source URLs are escaped and no claim of a completed game redemption is made', () => {
  assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.equal(safeHttps('javascript:alert(1)'), '');assert.equal(safeHttps('https://user:secret@example.org'), '');
  const markup=giftMarkupFor({...CAMPAIGN,title:'<img onerror="x">',source_url:'javascript:alert(1)'});
  assert.equal(markup.includes('<img'),false);assert.equal(markup.includes('href="javascript:'),false);
  assert.match(markup,/Copiar não resgata automaticamente/);assert.match(markup,/<dialog /);assert.match(markup,/Minimizar presente/);
  assert.equal(isExpired({...CAMPAIGN,expires_at:'invalid'}),true);assert.equal(revealedRow([row()],CAMPAIGN.id).code,'TEST-CODE');
});

// Small DOM double for the view's lifecycle; it does not validate browser layout.
function visualFixture({reduced=false,width=1200,height=850}={}) {
  const timer=clock();const selectors=new Map();const copied=[];let doc;let root;let minimized=0;let activations=0;
  const documentEvents=new Map();const motionEvents=new Map();const windowEvents=new Map();const viewportEvents=new Map();const scrolls=[];
  const motionQuery={matches:reduced,addEventListener:(name,fn)=>motionEvents.set(name,fn),removeEventListener:name=>motionEvents.delete(name)};
  function element(name='div') {
    const attrs=new Map();const handlers=new Map();const classes=new Set();
    const el={name,children:[],dataset:{},hidden:false,disabled:false,isConnected:true,textContent:'',innerHTML:'',className:'',open:false,
      style:{overflow:'',position:'',top:'',left:'',width:'',cssText:''},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,on){if(on)classes.add(value);else classes.delete(value);}},
      setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key)??null,removeAttribute:key=>attrs.delete(key),
      appendChild(child){child.parent=this;this.children.push(child);return child;},
      remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},
      addEventListener:(name,fn)=>handlers.set(name,fn),fire:(name,event={})=>handlers.get(name)?.(event),
      focus(){doc.activeElement=this;},showModal(){this.open=true;},close(){this.open=false;},
      contains(other){for(let node=other;node;node=node.parent)if(node===this)return true;return false;},
      closest(selector){for(let node=this;node;node=node.parent){if(selector==='[hidden]'&&node.hidden)return node;if(selector==='details:not([open])'&&node.name==='details'&&!node.open)return node;}return null;},
      matches:selector=>selector===name,
      getBoundingClientRect:()=>({left:300,top:200,width:238,height:202}),
      querySelector(selector){if(selector==='.echo-promo-confetti-layer')return this.children.find(x=>x.className===selector.slice(1))||null;return selectors.get(selector)||null;},
      querySelectorAll(){return ['.echo-promo-motion','.echo-promo-minimize','.echo-promo-gift','.echo-promo-code-box','.echo-promo-copy-button','.echo-promo-button','.echo-promo-details summary','.echo-promo-source'].map(s=>selectors.get(s)).filter(x=>!x.disabled);}
    };return el;
  }
  doc={visibilityState:'visible',documentElement:{style:{overflow:'auto'}},head:element('head'),body:element('body'),activeElement:null,
    getElementById:()=>({}),querySelector:()=>f.otherDialog||null,
    addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name),
    createRange:()=>({selectNodeContents(){}}),
    createElement(name){const el=element(name);if(name==='aside')root=el;return el;}
  };
  for(const key of ['.echo-promo-dialog','.echo-promo-launcher','.echo-promo-button','.echo-promo-gift','.echo-promo-code-box','.echo-promo-reward','.echo-promo-status','#echo-promo-title','.echo-promo-action-area','.echo-promo-copy-button','.echo-promo-minimize','.echo-promo-motion','#echo-promo-description','.echo-promo-launcher strong','.echo-promo-launcher small','.echo-promo-unlocked','.echo-promo-redemption','.echo-promo-action-note','.echo-promo-source'])selectors.set(key,element());
  selectors.set('.echo-promo-details',element('details'));selectors.set('.echo-promo-details summary',element('summary'));
  selectors.get('.echo-promo-details').appendChild(selectors.get('.echo-promo-details summary'));selectors.get('.echo-promo-details').appendChild(selectors.get('.echo-promo-source'));
  selectors.get('.echo-promo-button').querySelector=()=>selectors.get('.button-label');selectors.set('.button-label',element('span'));
  selectors.get('.echo-promo-motion').querySelector=()=>selectors.get('.motion-icon');selectors.set('.motion-icon',element('span'));
  const reward=selectors.get('.echo-promo-reward');reward.hidden=true;reward.appendChild(selectors.get('.echo-promo-code-box'));reward.appendChild(selectors.get('.echo-promo-copy-button'));
  selectors.get('.echo-promo-action-area').appendChild(selectors.get('.echo-promo-button'));
  const outside=element('button');doc.activeElement=outside;
  const win={...timer,innerWidth:width,innerHeight:height,scrollX:0,scrollY:0,
    getComputedStyle:el=>({position:el.style.position||'static',width:`${width-15}px`}),
    scrollTo:(x,y)=>scrolls.push({x,y,behavior:doc.documentElement.style.scrollBehavior}),
    addEventListener:(name,fn)=>windowEvents.set(name,fn),removeEventListener:name=>windowEvents.delete(name),
    visualViewport:{addEventListener:(name,fn)=>viewportEvents.set(name,fn),removeEventListener:name=>viewportEvents.delete(name)},
    matchMedia:()=>motionQuery,navigator:{clipboard:{writeText:async text=>{copied.push(text);}}},getSelection:()=>({removeAllRanges(){},addRange(){}})};
  const f={doc,win,timer,selectors,copied,outside,documentEvents,motionEvents,windowEvents,viewportEvents,scrolls,motionQuery,otherDialog:null,get minimized(){return minimized;},get activations(){return activations;},get root(){return root;}};
  f.view=createPromoGiftView(CAMPAIGN,{doc,win,onAction:()=>{activations+=1;},onMinimize:()=>{minimized+=1;}});
  f.node=selector=>selectors.get(selector);
  f.view.lock({authenticated:true});return f;
}

test('the actual view opens a native dialog, handles keyboard wrap and restores focus on Escape', () => {
  const f=visualFixture();assert.equal(f.view.open(),true);assert.equal(f.doc.documentElement.style.overflow,'hidden');
  assert.equal(f.doc.activeElement,f.node('#echo-promo-title'));
  let prevented=false;f.node('.echo-promo-dialog').fire('keydown',{key:'Tab',shiftKey:true,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(f.doc.activeElement,f.node('.echo-promo-details summary'));
  f.node('.echo-promo-dialog').fire('keydown',{key:'Tab',shiftKey:false,preventDefault(){}});assert.equal(f.doc.activeElement,f.node('.echo-promo-motion'));
  f.node('.echo-promo-details').open=true;f.node('.echo-promo-dialog').fire('keydown',{key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(f.doc.activeElement,f.node('.echo-promo-source'));
  f.node('.echo-promo-dialog').fire('cancel',{preventDefault(){}});assert.equal(f.view.isOpen(),false);assert.equal(f.doc.activeElement,f.outside);assert.equal(f.doc.documentElement.style.overflow,'auto');assert.equal(f.minimized,1);f.view.destroy();
});

test('the actual gift and button share an action, and waiting suppresses repeated clicks', () => {
  const f=visualFixture();f.node('.echo-promo-gift').fire('click');assert.equal(f.activations,1);f.view.waiting();f.node('.echo-promo-button').fire('click');f.node('.echo-promo-gift').fire('click');assert.equal(f.activations,1);f.view.destroy();
});

test('closing and destroying restore page styles and scroll position without smooth scrolling', () => {
  for(const [x,y] of [[0,620],[-12,-8]]){
    const f=visualFixture();f.win.scrollX=x;f.win.scrollY=y;
    Object.assign(f.doc.body.style,{position:'relative',top:'3px',left:'4px',width:'92%'});
    f.doc.documentElement.style.scrollBehavior='smooth';
    const before={...f.doc.body.style};
    f.view.open();assert.equal(f.doc.body.style.position,'fixed');
    assert.equal(f.doc.body.style.top,`${-y}px`);assert.equal(f.doc.body.style.left,`${-x}px`);
    assert.equal(f.doc.body.style.width,'1185px');
    f.view.minimize();assert.deepEqual(f.doc.body.style,before);
    assert.deepEqual(f.scrolls,[{x,y,behavior:'auto'}]);assert.equal(f.doc.documentElement.style.scrollBehavior,'smooth');
    f.view.open();f.view.destroy();assert.deepEqual(f.doc.body.style,before);
    assert.equal(f.doc.documentElement.style.overflow,'auto');assert.equal(f.scrolls.length,2);
    assert.equal(f.windowEvents.size,0);assert.equal(f.viewportEvents.size,0);
  }
});

test('a page body already fixed by its layout is not repositioned by the gift', () => {
  const f=visualFixture();Object.assign(f.doc.body.style,{position:'fixed',top:'-150px',left:'2px',width:'100%'});
  const before={...f.doc.body.style};f.view.open();assert.deepEqual(f.doc.body.style,before);
  f.view.minimize();assert.deepEqual(f.doc.body.style,before);assert.equal(f.scrolls.length,0);f.view.destroy();
});

test('opening holds the reveal, emits three bounded waves and settles into an unobstructed code', async () => {
  for(const [width,height,count] of [[390,844,72],[844,390,72],[320,568,72],[507,1024,72],[820,1180,108],[1180,820,108],[1366,768,108]]){
    const f=visualFixture({width,height});f.view.open();f.view.reveal('VIEW-CODE',{celebrate:true});assert.equal(f.node('.echo-promo-code-box').textContent,'');
    await f.timer.advance(649);assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);assert.equal(f.node('.echo-promo-code-box').textContent,'');
    await f.timer.advance(1);const layer=f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer');assert.equal(layer.children.length,count);assert.equal(layer.getAttribute('aria-hidden'),'true');
    const values=layer.children.map(piece=>Object.fromEntries([...piece.style.cssText.matchAll(/--([\w-]+):(-?[\d.]+)/g)].map(([,name,value])=>[name,Number(value)])));
    assert.deepEqual([...new Set(values.map(value=>Math.floor(value.delay/160)))],[0,1,2]);
    assert.equal(values.every(value=>value.duration+value.delay<3500&&value['burst-y']<0),true);
    assert.equal(values.some(value=>value['burst-x']<0)&&values.some(value=>value['burst-x']>0),true);
    assert.deepEqual(new Set(layer.children.map(piece=>piece.className.split(' ')[1])),new Set(['is-heart','is-star','is-circle','is-ribbon']));
    await f.timer.advance(749);assert.equal(f.node('.echo-promo-code-box').textContent,'');
    await f.timer.advance(1);assert.equal(f.node('.echo-promo-code-box').textContent,'VIEW-CODE');assert.equal(f.node('.echo-promo-reward').hidden,false);
    await f.timer.advance(900);assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);assert.equal(f.root.dataset.celebrating,undefined);assert.equal(f.timer.pendingCount(),0);f.view.destroy();
  }
});

test('viewport changes settle a confirmed opening, clear pending waves and never activate a like', async () => {
  for(const eventSource of ['windowEvents','viewportEvents']){
    for(const elapsed of [300,900]){
      const f=visualFixture({width:390,height:844});f.view.open();
      f[eventSource].get('resize')();assert.equal(f.node('.echo-promo-code-box').textContent,'');
      f.view.reveal('ROTATION-CONFIRMED',{celebrate:true});await f.timer.advance(elapsed);
      f.win.innerWidth=844;f.win.innerHeight=390;f[eventSource].get('resize')();
      assert.equal(f.root.dataset.state,'revealed');assert.equal(f.node('.echo-promo-code-box').textContent,'ROTATION-CONFIRMED');
      assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);
      assert.equal(f.timer.pendingCount(),0);await f.timer.advance(5000);
      assert.equal(f.root.dataset.celebrating,undefined);assert.equal(f.activations,0);f.view.destroy();
      assert.equal(f.windowEvents.size,0);assert.equal(f.viewportEvents.size,0);
    }
  }
});

test('resizing after reveal removes confetti but preserves the independent copy feedback timer', async () => {
  const f=visualFixture();f.view.open();f.view.reveal('COPIED-BEFORE-RESIZE',{celebrate:true});await f.timer.advance(1400);
  await f.node('.echo-promo-copy-button').fire('click');f.windowEvents.get('resize')();
  assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);
  assert.equal(f.node('.echo-promo-copy-button').textContent,'Copiado!');assert.equal(f.timer.pendingCount(),1);
  await f.timer.advance(1800);assert.equal(f.node('.echo-promo-copy-button').textContent,'Copiar código');f.view.destroy();
});

test('locking during the animation cancels timers, removes confetti and erases the secret', async () => {
  const f=visualFixture();f.view.open();f.view.reveal('DO-NOT-KEEP',{celebrate:true});await f.timer.advance(650);f.view.lock({authenticated:false});await f.timer.advance(5000);
  assert.equal(f.node('.echo-promo-code-box').textContent,'');assert.equal(f.node('.echo-promo-reward').hidden,true);assert.equal(f.root.dataset.state,'locked');assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);f.view.destroy();
});

test('reduced motion and a hidden tab reveal immediately without particles', async () => {
  for(const hidden of [false,true]){
    const f=visualFixture({reduced:!hidden});f.view.open();if(hidden)f.doc.visibilityState='hidden';f.view.reveal('STATIC-CODE',{celebrate:true});
    assert.equal(f.root.dataset.state,'revealed');assert.equal(f.node('.echo-promo-code-box').textContent,'STATIC-CODE');await f.timer.advance(3000);assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);f.view.destroy();
  }
});

test('minimizing mid-animation preserves the confirmed result without replaying effects', async () => {
  const f=visualFixture();f.view.open();f.view.reveal('CONFIRMED',{celebrate:true});await f.timer.advance(650);f.view.minimize();assert.equal(f.root.dataset.motion,'paused');assert.equal(f.timer.pendingCount(),0);await f.timer.advance(4000);f.node('.echo-promo-launcher').fire('click');
  assert.equal(f.node('.echo-promo-code-box').textContent,'CONFIRMED');assert.equal(f.root.dataset.state,'revealed');assert.equal(f.view.isOpen(),true);assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);f.view.destroy();
});

test('the pause control stops the celebration immediately, retains the confirmed code and never replays it on resume', async () => {
  const f=visualFixture();f.view.open();f.view.reveal('PAUSED-CODE',{celebrate:true});await f.timer.advance(650);
  f.node('.echo-promo-motion').fire('click');assert.equal(f.root.dataset.motion,'paused');assert.equal(f.root.dataset.state,'revealed');assert.equal(f.root.dataset.celebrating,undefined);
  assert.equal(f.node('.echo-promo-code-box').textContent,'PAUSED-CODE');assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);assert.equal(f.timer.pendingCount(),0);
  assert.equal(f.node('.echo-promo-motion').getAttribute('aria-pressed'),'true');
  f.node('.echo-promo-motion').fire('click');assert.equal(f.root.dataset.motion,'active');await f.timer.advance(5000);assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);f.view.destroy();
});

test('tab visibility and live reduced-motion changes cancel queued effects and remove subscriptions on destroy', async () => {
  for(const mode of ['hidden','reduced']){
    const f=visualFixture();f.view.open();f.view.reveal('SAFE-MOTION',{celebrate:true});if(mode==='reduced')await f.timer.advance(650);
    if(mode==='hidden'){f.doc.visibilityState='hidden';f.documentEvents.get('visibilitychange')();}
    else{f.motionQuery.matches=true;f.motionEvents.get('change')();assert.equal(f.node('.echo-promo-motion').disabled,true);}
    assert.equal(f.root.dataset.motion,'paused');assert.equal(f.node('.echo-promo-code-box').textContent,'SAFE-MOTION');assert.equal(f.timer.pendingCount(),0);
    assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);
    f.doc.visibilityState='visible';f.motionQuery.matches=false;f.documentEvents.get('visibilitychange')();await f.timer.advance(5000);
    assert.equal(f.root.dataset.motion,'active');assert.equal(f.root.dataset.celebrating,undefined);assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);
    f.view.destroy();assert.equal(f.documentEvents.size,0);assert.equal(f.motionEvents.size,0);
  }
});

test('replacing a visual sequence cannot accumulate particle layers or leave timers after destroy', async () => {
  const f=visualFixture();f.view.open();f.view.reveal('FIRST',{celebrate:true});await f.timer.advance(650);
  const oldLayer=f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer');f.view.reveal('SECOND',{celebrate:true});assert.equal(oldLayer.isConnected,false);
  await f.timer.advance(650);assert.equal(f.node('.echo-promo-dialog').children.filter(el=>el.className==='echo-promo-confetti-layer').length,1);
  f.view.destroy();assert.equal(f.timer.pendingCount(),0);assert.equal(f.documentEvents.size,0);assert.equal(f.motionEvents.size,0);await f.timer.advance(5000);assert.equal(f.node('.echo-promo-code-box').textContent,'');
});

test('copy only uses a currently revealed value and a stale clipboard response cannot change the new state', async () => {
  const f=visualFixture();f.view.open();await f.node('.echo-promo-copy-button').fire('click');assert.equal(f.copied.length,0);
  f.view.reveal('COPY-ME');await f.node('.echo-promo-copy-button').fire('click');assert.deepEqual(f.copied,['COPY-ME']);
  const result=pending();f.win.navigator.clipboard.writeText=()=>result.promise;const action=f.node('.echo-promo-copy-button').fire('click');f.view.expire();result.resolve();await action;
  assert.equal(f.node('.echo-promo-code-box').textContent,'');assert.equal(f.root.dataset.state,'expired');f.view.destroy();
});

test('settling the celebration preserves copy feedback and copy failures remain visibly actionable', async () => {
  const f=visualFixture();f.view.open();f.view.reveal('COPY-AFTER-OPEN',{celebrate:true});await f.timer.advance(1400);
  await f.node('.echo-promo-copy-button').fire('click');assert.equal(f.node('.echo-promo-copy-button').textContent,'Copiado!');
  await f.timer.advance(900);assert.equal(f.node('.echo-promo-dialog').querySelector('.echo-promo-confetti-layer'),null);assert.equal(f.node('.echo-promo-copy-button').textContent,'Copiado!');assert.equal(f.timer.pendingCount(),1);
  await f.timer.advance(900);assert.equal(f.node('.echo-promo-copy-button').textContent,'Copiar código');assert.equal(f.timer.pendingCount(),0);
  f.win.navigator.clipboard.writeText=async()=>{throw new Error('clipboard unavailable');};await f.node('.echo-promo-copy-button').fire('click');
  assert.equal(f.node('.echo-promo-status').classList.contains('echo-promo-error'),true);assert.match(f.node('.echo-promo-status').textContent,/selecionado/);assert.equal(f.doc.activeElement,f.node('.echo-promo-code-box'));f.view.destroy();
});

test('the gift does not steal the top layer from an existing login dialog', () => {
  const f=visualFixture();f.otherDialog={};assert.equal(f.view.open({automatic:true}),false);assert.equal(f.view.isOpen(),false);assert.equal(f.doc.activeElement,f.outside);f.view.destroy();
});

test('a browser without Clipboard API still offers selected code and an actionable manual copy message', async () => {
  const f=visualFixture();f.win.navigator.clipboard=undefined;f.view.open();f.view.reveal('MANUAL-COPY');
  await f.node('.echo-promo-copy-button').fire('click');
  assert.equal(f.doc.activeElement,f.node('.echo-promo-code-box'));assert.match(f.node('.echo-promo-status').textContent,/selecionado/);
  assert.equal(f.node('.echo-promo-status').classList.contains('echo-promo-error'),true);assert.equal(f.copied.length,0);f.view.destroy();
});
