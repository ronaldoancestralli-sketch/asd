import { resolveExternalDataEffect } from '../js/equipment-data-limits.js?v=2';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function text(selector) {
  return document.querySelector(selector)?.textContent?.trim() || '';
}

export async function runPresentationSourceTests() {
  // runtime-compat usa MutationObserver/requestAnimationFrame para aplicar a apresentação.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const pickupLabel = text('#case-pickup .stat-label');
  const pickupDescription = text('#case-pickup .stat-desc');
  const movementLabel = text('#case-movement .stat-label');
  const movementDescription = text('#case-movement .stat-desc');
  const knownExternal = resolveExternalDataEffect('VelocidadeParaPegarMelhoriasPercentual');

  const cases = [
    {
      name: 'Coleta de melhorias não é rebatizada como velocidade de movimento',
      run() {
        assert(!/velocidade de movimento/i.test(pickupLabel), `Rótulo incorreto: ${pickupLabel}`);
        assert(!/velocidade de movimento/i.test(pickupDescription), `Descrição incorreta: ${pickupDescription}`);
      }
    },
    {
      name: 'A fonte conhecida identifica coleta de melhorias pelo significado correto',
      run() {
        assert(knownExternal?.id === 'improvement_pickup_speed', `ID encontrado: ${knownExternal?.id || 'nenhum'}`);
        assert(knownExternal?.label === 'Velocidade de coleta de melhorias', `Rótulo encontrado: ${knownExternal?.label || 'nenhum'}`);
      }
    },
    {
      name: 'Velocidade de movimento real continua recebendo apresentação de movimento',
      run() {
        assert(/velocidade de movimento/i.test(movementLabel), `Rótulo: ${movementLabel}`);
        assert(/velocidade de movimento/i.test(movementDescription), `Descrição: ${movementDescription}`);
      }
    }
  ];

  return cases.map(test => {
    try {
      test.run();
      return { name: test.name, ok: true, error: '' };
    } catch (error) {
      return { name: test.name, ok: false, error: error?.message || String(error) };
    }
  });
}
