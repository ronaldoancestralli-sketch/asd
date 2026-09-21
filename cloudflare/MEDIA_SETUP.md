# Mídia — conta Cloudflare atual

## Recursos

- Bucket: `echo-arena-media`, classe Standard, sem domínio público direto.
- Worker: `echo-arena-media-api`.
- API: `https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev`.
- Leitura pública: `/files/<chave>`; diagnóstico sem dados sensíveis: `/health`.
- Supabase exclusivo: SNV (`nqklhsfaqpbjqmfzjzxk`). A migração de compatibilidade de URL não move nem atualiza dados existentes.

## Fronteiras

Novos envios administrativos usam o Worker novo. O Supabase continua guardando cadastros e URLs, não os bytes desses novos arquivos. `LEGACY_MEDIA_API_URL` permanece separado: URLs absolutas e caminhos históricos não são reescritos para um bucket vazio. A disponibilidade da hospedagem antiga não está garantida e não se deve presumir que seus arquivos tenham sido copiados.

O bucket não aceita gravação pública. O Worker valida a sessão no Auth do SNV antes de ler claims, exige AAL2, confere o emissor e consulta `echo_is_admin`. A allowlist inicial usa a autoridade de fundador já existente; outros membros só devem ser incluídos após aprovação explícita. Não publicar UUIDs administrativos, credenciais ou valores de bindings em documentação.

Mantidos: imagens de até 8 MiB e vídeos MP4/WebM de até 20 MiB, conferência de assinatura e nomes únicos. O corpo multipart é limitado a 21 MiB. Mídias antigas/externas não são alcançadas pela limpeza de uploads incompletos da conta nova.

GET/HEAD não gravam nem importam objetos. Leitura parcial retorna 206 e Content-Range; ranges inválidos retornam 416. Respostas completas podem usar cache, mas isso não elimina a contagem de solicitações ao Worker. Objetos são públicos e imutáveis; excluir um objeto não é garantia de remoção instantânea de cópias já armazenadas em caches distribuídos.

## Implantação

`wrangler.toml.example` documenta os bindings e o entrypoint relativos à pasta `cloudflare`. A implantação inicial usa a conexão Cloudflare autorizada, sem transferir tokens para o GitLab. `SUPABASE_ANON_KEY` é um nome legado de binding, preenchido com a chave publicável moderna ativa; nunca usar uma chave privilegiada.

O build do Pages inclui a configuração de mídia no hash de cache dos módulos. A CSP permite os dois hosts exatos, sem liberar todos os Workers. O manifesto de versão pública não muda: esta é uma troca de infraestrutura, não um lançamento visual.

## Validação

A migração `20260828114022_hero_media_r2_url_compat.sql` foi registrada pela integração do Supabase, pois a CLI estava indisponível. Ela preserva URLs absolutas dos hosts autorizados, mantém o destino dos caminhos relativos e modifica somente o inicializador de URL de `upsert_hero_media`. Proprietário e ACL existentes são preservados; o helper novo não fica acessível a `anon`/`authenticated`. Os testes embutidos não gravam registros. O job `hero-media-database` usa PostgreSQL descartável para testar INSERT/UPDATE reais, caminhos legados, permissões e reaplicação. Não executar esse fixture no SNV.

O advisor não apresentou novos alertas após a migração. Existem alertas anteriores fora desta mudança, incluindo uma view com privilégios do proprietário; isso não equivale a uma auditoria global aprovada.

Executar `node --test tests/media-worker-r2.test.mjs tests/media-storage-routing.test.mjs`, incluído nos Quality Gates. Os testes usam Auth/R2 simulados e não representam uma sessão administrativa real.

Antes da troca em produção, conferir `/health`. Após a troca, fazer um upload pequeno pelo Admin com MFA: o resultado deve apontar para `/files/` no Worker novo. Testar reprodução e avanço do vídeo em Safari/iPad/mobile. A verificação HTTP externa ficou pendente na sessão inicial porque a ferramenta de navegação bloqueou o novo endereço. Não interpretar a confirmação de deploy da API como teste real de reprodução.

## Consumo e recuperação

Não foi contratado plano adicional nem habilitada cópia automática das mídias antigas. A franquia gratuita do R2 Standard não é um teto de gastos. Acompanhar armazenamento, operações e solicitações do Worker após os uploads reais. Nenhuma promessa de custo zero ou migração completa é feita.

Para uma reversão, preservar os objetos novos e seus URLs. Não excluir bucket/Worker: cadastros já salvos podem apontar para eles. Reverter apenas o roteamento de novos envios exige revisar a disponibilidade da conta anterior.
