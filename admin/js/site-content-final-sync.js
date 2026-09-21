import { SITE_CONTENT_PAGES } from '../../js/site-content-schema.js?v=8';

const field = (key, label, type='text', group='Conteúdo', extra={}) => ({ key, label, type, group, ...extra });
const statistics = SITE_CONTENT_PAGES.find(page => page.key === 'statistics');

if (statistics) {
  statistics.description = 'Textos e explicações da Central de Inteligência. Contagens, rankings e distribuições continuam dinâmicos e vêm das fontes públicas.';
  statistics.fields = [
    field('meta_title','Título da aba','text','SEO',{max:70}),
    field('meta_description','Descrição para buscadores','textarea','SEO',{max:180}),
    field('watermark','Marca d’água','text','Destaque',{max:18}),
    field('explorer_kicker','Chamada superior','text','Destaque',{max:45}),
    field('explorer_title','Título principal','text','Destaque',{max:45}),
    field('explorer_accent','Destaque do título','text','Destaque',{max:30}),
    field('explorer_description','Descrição principal','textarea','Destaque',{max:320}),
    field('activity_button','Botão: ver atividade','text','Ações',{max:30}),
    field('open_build_button','Botão: criar build','text','Ações',{max:30}),
    field('command_kicker','Painel atual — chamada','text','Leitura atual',{max:30}),
    field('command_title','Painel atual — título','text','Leitura atual',{max:50}),
    field('metric_heroes_label','Heróis — rótulo','text','Leitura atual',{max:35}),
    field('metric_heroes_description','Heróis — apoio','text','Leitura atual',{max:45}),
    field('metric_builds_label','Builds — rótulo','text','Leitura atual',{max:35}),
    field('metric_builds_description','Builds — apoio','text','Leitura atual',{max:45}),
    field('metric_equipments_label','Equipamentos — rótulo','text','Leitura atual',{max:40}),
    field('metric_equipments_description','Equipamentos — apoio','text','Leitura atual',{max:45}),
    field('metric_compositions_label','Composições — rótulo','text','Leitura atual',{max:42}),
    field('metric_compositions_description','Composições — apoio','text','Leitura atual',{max:45}),
    field('activity_kicker','Atividade — chamada','text','Atividade',{max:35}),
    field('activity_title','Atividade — título','text','Atividade',{max:60}),
    field('activity_description','Atividade — descrição','textarea','Atividade',{max:240}),
    field('activity_link','Atividade — link','text','Atividade',{max:35}),
    field('activity_criterion','Atividade — critério','text','Atividade',{max:45}),
    field('reading_kicker','Como ler — chamada','text','Atividade',{max:25}),
    field('reading_title','Como ler — título','text','Atividade',{max:55}),
    field('reading_description','Como ler — descrição','textarea','Atividade',{max:280}),
    field('coverage_kicker','Cobertura — chamada','text','Cobertura',{max:40}),
    field('coverage_title','Cobertura — título','text','Cobertura',{max:60}),
    field('coverage_description','Cobertura — descrição','textarea','Cobertura',{max:220}),
    field('coverage_meta','Cobertura — selo','text','Cobertura',{max:45}),
    field('classes_kicker','Classes — chamada','text','Cobertura',{max:25}),
    field('classes_title','Classes — título','text','Cobertura',{max:45}),
    field('equipment_kicker','Equipamentos — chamada','text','Cobertura',{max:30}),
    field('equipment_title','Equipamentos — título','text','Cobertura',{max:45}),
    field('build_feed_kicker','Build feed — chamada','text','Build feed',{max:30}),
    field('build_feed_title','Build feed — título','text','Build feed',{max:55}),
    field('build_feed_description','Build feed — descrição','textarea','Build feed',{max:250}),
    field('build_feed_meta','Build feed — selo','text','Build feed',{max:45}),
    field('signal_kicker','Sinal de engajamento — chamada','text','Build feed',{max:35}),
    field('methodology_kicker','Metodologia — chamada','text','Transparência',{max:35}),
    field('methodology_title','Metodologia — título','text','Transparência',{max:80}),
    field('source_heroes_title','Fonte Heróis — título','text','Transparência',{max:25}),
    field('source_heroes_description','Fonte Heróis — descrição','textarea','Transparência',{max:260}),
    field('source_builds_title','Fonte Builds — título','text','Transparência',{max:25}),
    field('source_builds_description','Fonte Builds — descrição','textarea','Transparência',{max:260}),
    field('source_failures_title','Falhas — título','text','Transparência',{max:25}),
    field('source_failures_description','Falhas — descrição','textarea','Transparência',{max:240})
  ];
}
