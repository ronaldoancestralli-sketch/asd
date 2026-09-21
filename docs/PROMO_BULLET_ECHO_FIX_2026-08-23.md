# Correção do módulo promocional — Bullet Echo

Data: 2026-08-23

- O módulo promocional do EchoArena é destinado ao **Bullet Echo**.
- O Admin agora fixa o campo de jogo em `Bullet Echo`.
- A Home só consulta campanhas de Bullet Echo que estejam `published=true`, `verification_status=verified` e `status=active`.
- A consulta pública também respeita `starts_at` e `expires_at`.
- Rascunhos administrativos não podem aparecer no banner público, inclusive quando o visitante logado é administrador.
- O cache público do módulo foi avançado para `20260823-promo-4`.
- O gate `scripts/check-promo-code-system.py` protege essas regras contra regressão.
