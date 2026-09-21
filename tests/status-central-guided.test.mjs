import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fixture, selection } from './fixtures/status-central-catalog.mjs';
import { previewEquipmentEffect, runtimePayload } from '../admin/js/status-central-workflow.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'admin/status-central.html'), 'utf8');
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

// Minimal controls drive the actual event handlers. There is no browser, auth,
// live page, RPC connection or visual assertion in this isolated DOM harness.
class Control {
  constructor(select = false) { this.select = select; this.listeners = {}; this._value = ''; this._html = ''; this.options = []; this.hidden = false; this.disabled = false; }
  set value(value) { this._value = this.select && !this.options.some(option => option.value === value) ? '' : value; }
  get value() { return this._value; }
  get selectedOptions() { return this.options.filter(option => option.value === this.value); }
  set innerHTML(value) {
    this._html = value;
    if (this.select) {
      this.options = [...value.matchAll(/<option value="([^"]*)">([\s\S]*?)<\/option>/g)].map(match => ({ value: decode(match[1]), textContent: decode(match[2]) }));
      this.value = this.options[0]?.value || '';
    }
  }
  get innerHTML() { return this._html; }
  replaceChildren() { this.innerHTML = ''; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  emit(type, target = this) { for (const handler of this.listeners[type] || []) handler({ target, preventDefault() {} }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
async function harness(data = fixture(), apiOverrides = {}) {
  const nodes = new Map([...html.matchAll(/id="(scg-[^"]+)"/g)].map(match => [match[1], new Control()]));
  for (const match of html.matchAll(/<select\b[^>]*id="(scg-[^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const control = new Control(true); control.innerHTML = match[2]; nodes.set(match[1], control);
  }
  const pending = [], errors = [], writes = [], advanced = [];
  const document = { getElementById(id) { assert.ok(nodes.has(id), `missing HTML control: ${id}`); return nodes.get(id); } };
  const context = vm.createContext({ document, console, structuredClone, crypto: { randomUUID }, URLSearchParams,
    __api: { loadStatusCentralData: async () => structuredClone(data), centralRpc: async name => { writes.push(name); throw new Error('No writes allowed in this test'); }, requestBrainProof: async () => { throw new Error('Brain unavailable in fixture'); }, ...apiOverrides } });
  const cache = new Map();
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = file.endsWith('/status-central-api.js') ? 'export const { loadStatusCentralData, centralRpc, requestBrainProof } = globalThis.__api;' : fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(source, { context, identifier: file });
    cache.set(file, module);
    await module.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier.split('?')[0])));
    return module;
  }
  const module = await load(path.join(root, 'admin/js/status-central-guided.js'));
  await module.evaluate();
  const api = module.namespace.mountStatusCentralGuided({ getData: () => data,
    action: task => { const job = Promise.resolve().then(task).catch(error => errors.push(error)); pending.push(job); return job; },
    onCentral: central => { data.central = central; api.invalidate(); }, openAdvanced: (...args) => advanced.push(args), openBase: (...args) => advanced.push(['base', ...args]) });
  api.refresh();
  const $ = id => nodes.get(`scg-${id}`);
  const change = (id, value, type = 'change') => { $(id).value = value; $(id).emit(type); };
  const flush = async () => { while (pending.length) await pending.shift(); };
  const setup = () => {
    const input = selection();
    change('equipment', input.equipmentId);
    change('variant', input.variantId);
    change('scope', 'weapon');
    change('target', 'weapon_spread');
    change('unit', 'degree', 'input');
    change('condition', 'moving', 'input');
    change('moving', 'true', 'input');
  };
  return { $, change, flush, setup, api, writes, errors, data, advanced };
}

test('configurar e testar pelo formulário real mostra antes/depois sem nenhum RPC de escrita', async () => {
  const h = await harness(); h.setup();
  assert.equal(h.$('hero').value, selection().heroId);
  assert.match(h.$('source-text').textContent, /quando em movimento/);
  assert.equal(h.$('new-target').hidden, false, 'a unidade é configurada na própria tela');
  h.$('form').emit('submit'); await h.flush();
  assert.equal(h.errors.length, 0);
  assert.match(h.$('result').innerHTML, /50/);
  assert.match(h.$('result').innerHTML, /36/);
  assert.match(h.$('result').innerHTML, /outro\(s\) efeito/);
  assert.equal(h.$('apply').disabled, false);
  assert.equal(h.writes.length, 0);
  h.$('apply').emit('click');
  assert.equal(h.$('publish-dialog').open, true);
  assert.match(h.$('publish-summary').innerHTML, /Comum/);
  assert.equal(h.writes.length, 0, 'abrir revisão também não grava');
});
test('trocar efeito com o mesmo nome limpa destino, condição, resultado e permissão de aplicar', async () => {
  const h = await harness(); h.setup();
  h.$('form').emit('submit'); await h.flush();
  h.$('effects').emit('click', { closest: () => ({ dataset: { effectKey: '1' } }) });
  assert.match(h.$('source-text').textContent, /ao mirar/);
  assert.equal(h.$('target').value, '');
  assert.equal(h.$('condition').value, '');
  assert.equal(h.$('moving').value, '');
  assert.equal(h.$('apply').disabled, true);
  assert.equal(h.$('result').innerHTML, '');
  h.change('variant', selection().variantId.replace('00000007', '00000008'));
  assert.equal(h.$('target').value, '');
  assert.match(h.$('source-text').textContent, /-30/);
});
test('alterar cenário depois do teste remove confirmação e cenário inativo mantém aplicação bloqueada', async () => {
  const h = await harness(); h.setup();
  h.$('form').emit('submit'); await h.flush();
  h.change('moving', 'false', 'input');
  assert.equal(h.$('apply').disabled, true);
  assert.equal(h.$('test-state').textContent, 'Ainda não testado');
  h.$('form').emit('submit'); await h.flush();
  assert.equal(h.$('apply').disabled, true);
  assert.match(h.$('feedback').textContent, /não atua/);
});
test('verificar regra ausente no site não exibe sucesso de publicação', async () => {
  const h = await harness(); h.setup();
  h.$('verify').emit('click'); await h.flush();
  assert.equal(h.$('test-state').textContent, 'Confirmação pendente');
  assert.notEqual(h.$('test-state').className, 'sc-badge good');
  assert.equal(h.$('apply').disabled, true);
  assert.equal(h.writes.length, 0);
});
test('correção de base e teste avançado recebem a mesma seleção', async () => {
  const h = await harness(); h.setup();
  h.$('form').emit('submit'); await h.flush();
  h.$('result').emit('click', { closest: selector => selector === '[data-guided-full-proof]' ? {} : null });
  assert.equal(h.advanced[0][0], 'proof');
  assert.equal(h.advanced[0][1].variantId, selection().variantId);
  assert.equal(h.advanced[0][1].conditions.moving, true);
  h.data.bases[0].weapon_stats.weapon_spread = null;
  h.api.invalidate();
  h.$('form').emit('submit'); await h.flush();
  assert.match(h.$('result').innerHTML, /Conferir o valor-base/);
  h.$('result').emit('click', { closest: selector => selector === '[data-guided-base]' ? {} : null });
  assert.equal(h.advanced[1][0], 'base');
  assert.equal(h.advanced[1][1].sourceKey, 'weapon_spread');
});

test('confirmação do formulário publica o efeito testado e distingue falha do Brain após salvar', async () => {
  for (const brainAvailable of [true, false]) {
    const data = fixture(), calls = [];
    const h = await harness(data, {
      centralRpc: async (name, args) => {
        calls.push(name);
        if (name === 'admin_save_status_central_v1') { data.central.draft = structuredClone(args.p_payload); data.central.draft_revision++; }
        if (name === 'admin_publish_status_central_v1') { data.central.active_publication++; data.central.published = { revision: data.central.draft_revision, fingerprint: 'fixture-published', payload: runtimePayload(data.central.draft) }; }
        return structuredClone(data.central);
      },
      requestBrainProof: async () => {
        if (!brainAvailable) throw new Error('Brain indisponível');
        return { calculationTrace: previewEquipmentEffect(data, selection()).published.calculation };
      }
    });
    h.setup(); h.$('form').emit('submit'); await h.flush();
    h.$('apply').emit('click'); h.$('confirm').emit('click'); await h.flush();
    assert.equal(h.errors.length, 0);
    assert.deepEqual(calls, ['admin_save_status_central_v1', 'admin_get_status_central_v1', 'admin_publish_status_central_v1', 'admin_get_status_central_v1']);
    assert.equal(h.$('apply').disabled, true, 'a mesma regra já está publicada');
    if (brainAvailable) {
      assert.equal(h.$('test-state').textContent, 'Este efeito foi confirmado no site');
      assert.match(h.$('feedback').textContent, /ainda tem 1 pendência/);
    } else {
      assert.equal(h.$('test-state').textContent, 'Publicado · confirmação pendente');
      assert.match(h.$('feedback').textContent, /Verificar no site/);
    }
  }
});
