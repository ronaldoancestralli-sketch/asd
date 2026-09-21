# EchoArena — Public Experience Handoff

Atualização: 2026-08-21 (America/Sao_Paulo)

Este documento complementa `PROJECT_HANDOFF.md` e registra exclusivamente a padronização visual pública aprovada durante o ciclo de repaginação.

## Padrão visual oficial

A página `herois.html` passou a ser a referência visual oficial do site público. O padrão aprovado inclui:

- cabeçalho público unificado;
- profundidade visual com superfícies em camadas;
- spotlight/contexto forte no topo;
- cards com hierarquia mais clara;
- filtros e navegação mais visuais;
- dados reais do Supabase, sem valores fictícios;
- estados de carregamento/erro explícitos;
- responsividade para desktop, tablet/iPad e mobile;
- cache-busting obrigatório em frontend alterado.

## Backups desta frente

- `backup/pre-public-navigation-unification-2026-08-21-0403`
- `backup/pre-heroes-experience-redesign-2026-08-21-0420`
- `backup/pre-global-public-redesign-2026-08-21-0440`
- `backup/pre-compare-builds-premium-cycle-2026-08-21-0507`
- `backup/pre-compare-premium-overlay-2026-08-21-0510`

## Preview público temporário

Branch:

`preview-herois-2026-08-21`

No marco deste documento, a branch de preview aponta para:

`403548eca5993f9ce4578f38deb7ae8a695ff746`

O preview é separado da produção e não exige merge do PR #4.

## Heróis

Arquivos principais:

- `herois.html`
- `css/herois-experience.css`
- `css/herois-detail.css`
- `js/herois-experience.js`
- `scripts/check-heroes-experience.py`

Principais mudanças:

- spotlight cinematográfico do herói em foco;
- navegação visual por classes;
- cards de roster enriquecidos;
- métricas provenientes do banco;
- ficha detalhada preservada;
- habilidades, histórico, fontes e status de verificação preservados;
- falhas de leitura mostram indisponibilidade, não zero fictício.

A aparência desta página foi aprovada visualmente pelo usuário no preview.

## Classes

Arquivos principais:

- `classes.html`
- `css/classes-experience.css`
- `js/classes-experience.js`

A página utiliza dados reais de `hero_classes` e `v_heroes_complete` para spotlight de classe, heróis vinculados e contagens.

## Equipamentos

Arquivos principais:

- `equipamentos.html`
- `css/equipamentos-base.css`
- `css/equipments-experience.css`
- `js/equipments-experience.js`

A experiência premium foi adicionada sem remover o drawer técnico existente.

Preservar obrigatoriamente:

- atributos por raridade;
- sets e bônus;
- efeitos informativos;
- efeitos dependentes de base externa;
- ausência de estimativas para dados que o jogo não publica.

## Composições

Arquivos principais:

- `composicoes.html`
- `css/compositions-experience.css`
- `js/compositions-experience.js`

A página recebeu experiência 3×3 e preview visual dos slots.

A persistência continua obrigatoriamente em:

`js/composition-transactional-save.js`

via RPC `save_team_composition()`.

Não reabrir o INSERT fragmentado legado de `public-modules.js`.

## Guias, Notícias e Tier List

Arquivos principais:

- `guias.html`
- `noticias.html`
- `tier-list.html`
- `css/editorial-experience.css`

Regra obrigatória:

- sem conteúdo de preenchimento;
- sem notícia fictícia;
- sem tier/ranking inventado;
- módulos vazios devem continuar visualmente completos, mas dizer claramente que aguardam publicação real.

## Estatísticas

Nova superfície:

- `estatisticas.html`
- `css/statistics-experience.css`
- `js/statistics-experience.js`

Fontes públicas usadas:

- `v_heroes_complete`;
- `v_popular_builds`;
- `equipments`;
- `team_compositions`.

Snapshot público validado com `SET LOCAL ROLE anon` durante o desenvolvimento:

- heróis ativos: 19;
- builds públicas: 9;
- equipamentos ativos: 7;
- composições públicas: 0;
- linhas visíveis em `v_popular_builds`: 8.

Esses números NÃO são hardcoded na UI; foram apenas uma prova de leitura pública naquele momento.

## Builds

`builds.html` deixou de ser apenas um redirecionamento e passou a funcionar como hub público premium.

A Mesa real continua em:

`criar-build.html`

O núcleo da Mesa não foi reconstruído durante a repaginação, pois já é uma ferramenta complexa e visualmente rica.

Contratos obrigatórios congelados por CI:

- `workbench-zone`;
- `hero-panel`;
- `synergy-stage`;
- anel `#ring`;
- contador `#eq-count`;
- `impact-panel`;
- `impact-grid`;
- navegação sincronizada por `syncPublicNavigation('builds')`;
- análise por `build-analise.js`;
- gravação por RPC `save_user_build`;
- nenhum `supabase.from('builds').insert` no frontend moderno;
- `game-stat-engine.js` permanece fonte matemática oficial.

Gate:

`scripts/check-build-workbench-experience.py`

## Comparar Builds

Arquivos adicionados:

- `css/compare-experience.css`
- `js/compare-experience.js`
- `scripts/check-compare-experience.py`

A página recebeu:

- hero visual mais forte;
- cards de build com maior profundidade;
- VS central reforçado;
- tabela de atributos mais integrada ao padrão premium;
- cockpit de comparação que espelha somente valores já produzidos por `comparar-build.js`.

O cockpit NÃO calcula nada. Ele lê:

- herói atual;
- fonte dos dados;
- build da comunidade selecionada;
- vantagens da build do usuário;
- empates;
- vantagens da build da comunidade.

Contratos preservados:

- `comparar-build.js` continua usando `game-stat-engine.js?v=12`;
- persistência continua em `comparar-build-persistence.js`;
- RPC canônica continua `toggle_saved_build_comparison`;
- rascunho local continua diferenciado de build persistida;
- compartilhamento externo continua limitado a build pública salva.

## Navegação pública

Arquivos:

- `css/public-header-sync.css`
- `js/public-header-sync.js`
- `js/module-public-shell.js`

O cabeçalho oficial usa o padrão da HOME/Heróis: logo Echo Arena, navegação horizontal, busca, autenticação e drawer mobile.

Não reintroduzir as sidebars paralelas antigas em Heróis/Comparar.

## Quality Gates confirmados durante a repaginação

- #232: success — primeira repaginação pesada de Heróis;
- #236: success — fallback honesto de habilidades;
- #262: success — Classes, Composições e Equipamentos;
- #272: success — módulos editoriais;
- #284: success — Central de Estatísticas;
- #302: success — Hub de Builds / rollout público;
- #312: success — cockpit premium de Comparar;
- #316: success — gate específico da Mesa de Builds.

HEAD CI-verificado deste documento:

`403548eca5993f9ce4578f38deb7ae8a695ff746`

## Limites de validação

- Estrutura, referências, cache-busting e sintaxe JS estão sob CI.
- Algumas páginas foram avaliadas via preview público, especialmente Heróis.
- NÃO afirmar smoke test visual completo de todas as páginas/dispositivos sem captura/browser real correspondente.
- NÃO alterar `game-stat-engine.js` por conveniência visual.
- NÃO inventar dados para preencher espaço visual.
- PR #4 continua Draft e sem merge até autorização explícita.
