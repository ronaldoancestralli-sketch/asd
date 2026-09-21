import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {giftMarkupFor} from '../js/promo-gift-view.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const html=read('admin/promo-codes.html');
const js=read('admin/js/promo-codes.js');
const migration=read('supabase/migrations/20260831040210_simplify_promo_admin_flow.sql');

test('o painel deixa somente o código como campo obrigatório',()=>{
  const required=[...html.matchAll(/<input\b[^>]*\brequired\b[^>]*>/g)].map(match=>match[0]);
  assert.equal(required.length,1);
  assert.match(required[0],/name="code"/);
  assert.doesNotMatch(html,/name="verification_status"|name="status"|name="published"|name="source_type"/);
  assert.match(html,/Fonte, validade e detalhes ajudam, mas são opcionais/);
  assert.match(html,/Remover do site/);
});

test('publicação rápida delega estados e autoria ao servidor',()=>{
  assert.match(js,/supabase\.rpc\('promo_admin_publish'/);
  assert.match(js,/supabase\.rpc\('promo_admin_remove'/);
  assert.match(js,/created_by_name/);
  assert.match(js,/Publicado por/);
  assert.doesNotMatch(js,/p_verification_status|p_status|p_published|promo_official_source_required/);
  assert.doesNotMatch(js,/delete\s+from\s+public\.promo_campaigns/i);
});

test('migration preserva segredo, autoria e remoção reversível',()=>{
  assert.match(migration,/create or replace function public\.promo_admin_publish/);
  assert.match(migration,/v_actor uuid := auth\.uid\(\)/);
  assert.match(migration,/created_by = coalesce\(public\.promo_campaigns\.created_by, v_actor\)/);
  assert.match(migration,/insert into public\.admin_log/);
  assert.match(migration,/'promo\.removed'/);
  assert.match(migration,/set published = false,[\s\S]*status = 'invalid'/);
  assert.match(migration,/source_url is null/);
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf('create or replace function public.promo_admin_remove'),
      migration.indexOf('drop function if exists public.promo_admin_list')
    ),
    /delete from public\.promo_campaigns/i
  );
});

test('presente público descreve corretamente campanha sem fonte',()=>{
  const markup=giftMarkupFor({
    title:'Teste',
    reward:'',
    banner_label:'CÓDIGO PROMOCIONAL',
    banner_message:'Curta para revelar.',
    source_name:null,
    source_url:null,
    expires_at:null
  });
  assert.match(markup,/Publicado pelo Echo Arena/);
  assert.match(markup,/Detalhes da promoção/);
  assert.match(markup,/Confira o resgate diretamente no jogo/);
  assert.doesNotMatch(markup,/href=""/);
  assert.doesNotMatch(markup,/publicação oficial/i);
});

test('fonte HTTPS opcional continua clicável e segura',()=>{
  const markup=giftMarkupFor({
    title:'Teste',
    reward:'',
    banner_label:'CÓDIGO PROMOCIONAL',
    banner_message:'Curta para revelar.',
    source_name:'Fonte informada',
    source_url:'https://example.com/post',
    expires_at:null
  });
  assert.match(markup,/Detalhes e fonte da promoção/);
  assert.match(markup,/href="https:\/\/example\.com\/post"/);
  assert.match(markup,/target="_blank" rel="noopener noreferrer"/);
});

