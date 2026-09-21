#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
failures = []

files = {
    'html': ROOT / 'diversao.html',
    'clash_js': ROOT / 'js/diversao-clash.js',
    'responsive_css': ROOT / 'css/diversao-responsive.css',
    'responsive_js': ROOT / 'js/diversao-responsive.js',
    'main_js': ROOT / 'js/diversao.js',
    'golden_js': ROOT / 'js/diversao-golden.js',
    'golden_overlay_js': ROOT / 'js/diversao-golden-overlay-v28.js',
    'shot_js': ROOT / 'js/diversao-shot.js',
    'guard_js': ROOT / 'js/diversao-runtime-guard-v19.js',
    'qa_js': ROOT / 'js/diversao-qa.js',
    'isolated_qa_js': ROOT / 'js/diversao-qa-isolated-v21.js',
    'audit_css': ROOT / 'css/diversao-audit-v19.css',
    'webkit_css': ROOT / 'css/diversao-webkit-v22.css',
    'golden_geometry_css': ROOT / 'css/diversao-golden-geometry-v26.css',
    'diagnostic_js': ROOT / 'js/diversao-golden-diagnostic-v26.js',
    'admin_lab': ROOT / 'admin/diversao-lab.html',
    'admin_lab_js': ROOT / 'admin/js/diversao-lab-mobile-v21.js',
}
for label, path in files.items():
    if not path.exists(): failures.append(f'Diversão: arquivo ausente: {path.relative_to(ROOT)}')

if not failures:
    text = {name: path.read_text(encoding='utf-8') for name, path in files.items()}
    for token in (
        './css/diversao-responsive.css?v=20260822-responsive-2',
        './css/diversao-audit-v19.css?v=20260827-diversao-audit-v19-1',
        './css/diversao-golden-geometry-v26.css?v=20260827-diversao-golden-geometry-v26-1',
        './js/diversao-clash.js?v=20260822-clash-3',
        './js/diversao-shot.js?v=20260827-diversao-audit-v19-1',
        './js/diversao-golden.js?v=20260827-diversao-golden-once-v30-1',
        './js/diversao-golden-overlay-v28.js?v=20260827-diversao-golden-overlay-v30-1',
        './js/diversao-responsive.js?v=20260827-diversao-ios-isolation-v21-1',
        './js/diversao-golden-diagnostic-v26.js?v=20260827-diversao-golden-diagnostic-v26-1',
        './js/public-header-sync.js?v=20260822-beta-nav-5',
    ):
        if token not in text['html']:
            failures.append(f'Diversão HTML sem contrato final: {token}')
    for token in ("document.createElement('section')", "overlay.id = 'sealed-clash'", "overlay.className = 'sealed-clash'", 'document.body.appendChild(overlay)', "new MutationObserver"):
        if token not in text['clash_js']: failures.append(f'Confronto Selado sem criação dinâmica esperada: {token}')
    for token in ("document.getElementById('sealed-clash')", "title.appendChild(eventBadge)", "sealedOverlay.dataset.responsiveLayout = 'v2'", "await import('./diversao-runtime-guard-v19.js?v=20260827-diversao-audit-v19-1')", "await import('./diversao-qa-isolated-v21.js?v=20260827-diversao-ios-isolation-v21-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1')"):
        if token not in text['responsive_js']: failures.append(f'Diversão JS responsivo sem contrato V21: {token}')
    for token in ('data-responsive-layout="v2"','100svh','env(safe-area-inset-top)','@media (min-width:621px) and (max-width:1024px)','@media (max-width:620px)','@media (max-width:620px) and (orientation:landscape)','@media (prefers-reduced-motion:reduce)','.sealed-vs','overflow:visible','justify-items:stretch','grid-column:2','justify-self:stretch','font-style:normal'):
        if token not in text['responsive_css']: failures.append(f'Diversão CSS responsivo sem contrato: {token}')
    for token in ('sealed-chaos-orbit-contained 8s linear infinite','.sealed-portrait.is-captain','left:50%','translate:-50% 0','will-change:transform,opacity'):
        if token not in text['audit_css']: failures.append(f'Diversão V19 sem estabilidade/hierarquia visual esperada: {token}')
    for forbidden in ('AudioContext.prototype.createGain =','AudioNode.prototype.connect =','NativeAudioContext.prototype.createGain ='):
        if forbidden in text['shot_js']: failures.append(f'Diversão ainda altera protótipo global de Web Audio: {forbidden}')
    for token in ('weaponObserver?.disconnect()',"source.addEventListener('ended'",'gain.gain.value = 0.72'):
        if token not in text['shot_js']: failures.append(f'Áudio isolado da Diversão sem contrato: {token}')
    for token in ('MutationObserver','7800',"window.addEventListener('pagehide'","document.addEventListener('visibilitychange'","window.addEventListener('unhandledrejection'"):
        if token not in text['guard_js']: failures.append(f'Watchdog da Diversão sem contrato: {token}')
    for token in ("Object.defineProperty(window, 'echoArenaDiversaoGolden'",'armForced','clear: clearGolden',".hero-draw-card.golden-reveal","detail: { state: 'armed', index: goldenIndex, mode, forced }",'isAppleTouchWebKitRuntime()',"document.documentElement.dataset.diversaoWebkitSafe = 'v22'","safeCss.href = './css/diversao-webkit-v22.css?v=20260827-diversao-webkit-v22-1'",'window.requestAnimationFrame','window.cancelAnimationFrame','appleTouchWebKit ? 118 : 70','let goldenSettled = false;','goldenSettled = true;',"state: 'settled'",'isSettled: () => goldenSettled','v30:golden-settled-once','v30:golden-settle-reentry-blocked'):
        if token not in text['golden_js']: failures.append(f'Câmara Dourada sem controlador/serialização one-shot V30: {token}')
    for token in ('const activated = new WeakSet();','activated.has(card)','activated.add(card)','v30:golden-overlay-activated-once','v30:duplicate-golden-reveal-ignored'):
        if token not in text['golden_overlay_js']: failures.append(f'Overlay dourado WebKit pode reativar o mesmo card: {token}')
    for token in ('html[data-diversao-webkit-safe="v22"]','contain:paint','mix-blend-mode:normal!important','.weapon-shell .user-revolver-svg','filter:none!important','.muzzle-flash','animation:golden-stage-flash .62s ease-out both','will-change:auto!important'):
        if token not in text['webkit_css']: failures.append(f'Perfil WebKit V22 sem redução de pico de compositor: {token}')
    if 'animation:none' in text['webkit_css']: failures.append('Perfil WebKit V22 não pode remover animações da Câmara Dourada')

    for token in ('inset:auto!important','right:auto!important','bottom:auto!important','width:max-content!important','height:auto!important','translate3d(-50%,0,0)'):
        if token not in text['golden_geometry_css']: failures.append(f'Selo dourado V26 ainda pode herdar geometria do gradiente base: {token}')
    if 'height:44%' in text['golden_geometry_css']:
        failures.append('Selo dourado V26 não pode reintroduzir height:44% do ::after base')
    for token in ('echoarena:diversao-golden-diagnostic-v26','localStorage.setItem','MutationObserver','card:golden-reveal','card:golden-reveal:paint-frame','echoarena:diversao-golden','echoarena:diversao-round-complete','RECUPERADO'):
        if token not in text['diagnostic_js']: failures.append(f'Diagnóstico persistente V26 incompleto: {token}')

    for token in ("eventId === 'mirror'","eventId === 'triple'","eventId === 'perfect-chaos'","eventId === 'complete'","window.addEventListener('message'",'fixture: true','window.echoArenaDiversaoGolden',"golden.armForced('full', 0)","await runner.run('full')"):
        if token not in text['qa_js']: failures.append(f'QA determinístico da Diversão sem contrato V20: {token}')
    for forbidden in ("stage.classList.add('golden-armed', 'golden-shot')","node?.classList.add('golden-active')","card?.classList.add('golden-reveal')"):
        if forbidden in text['qa_js']: failures.append(f'Laboratório voltou a duplicar manualmente a Câmara Dourada: {forbidden}')
    for token in ('isAppleTouchWebKit()',"const ISOLATED_KEY = 'echoarena:diversao-isolated-qa-v21'","frame?.removeAttribute('src')",'frame.hidden = true',"sessionStorage.setItem(ISOLATED_KEY","location.assign(url.href)",'frame.src = source',"document.body.dataset.diversaoQaMode = 'isolated-mobile'"):
        if token not in text['admin_lab_js']: failures.append(f'Laboratório mobile sem isolamento WebKit V21: {token}')
    for token in ("await import('./diversao-qa.js?v=20260827-diversao-golden-v20-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1')","params.get('qa') !== 'isolated-v21'","params.get('qaRun') !== '1'",'Date.now() - issuedAt > 60000',"sessionStorage.getItem(ISOLATED_KEY)","execute.addEventListener('click'",'task = qa.forceGolden()',"task = runner.run('full')","sessionStorage.setItem(RESULT_KEY",'location.assign(command.returnHref)','preserva a ativação de áudio do iPhone'):
        if token not in text['isolated_qa_js']: failures.append(f'Runner isolado V21 incompleto: {token}')
    for token in ('Laboratório da Diversão','Formação Completa','Confronto Espelho','Trinca Selada','Caos Perfeito','Câmara Dourada','data-lab-command','iPhone/WebKit','data-src="../diversao.html?qa=embedded-v21"','./js/diversao-lab-mobile-v21.js?v=20260827-diversao-ios-isolation-v21-1'):
        if token not in text['admin_lab']: failures.append(f'Laboratório Admin da Diversão incompleto V21: {token}')
    if '<iframe id="diversao-lab-frame" src=' in text['admin_lab']: failures.append('Laboratório Admin voltou a carregar o preview pesado imediatamente no iPhone')
    if 'Math.random' not in text['main_js']: failures.append('Diversão perdeu a aleatoriedade explícita do sorteio público')

if failures:
    print(f'DIVERSÃO GATE: FALHOU com {len(failures)} problema(s)', file=sys.stderr)
    for failure in failures: print('-', failure, file=sys.stderr)
    raise SystemExit(1)

print('DIVERSÃO GATE: OK · animações preservadas, Câmara Dourada one-shot V30, overlay sem reentrada, checkpoints persistentes ativos, QA iPhone isolado e contratos de áudio/watchdog/mobile preservados.')
