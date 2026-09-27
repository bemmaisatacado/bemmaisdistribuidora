# BemMais — Arquitetura do Core (Fase 1)

## Multi-tenant
- `organizations` (a plataforma é a única com `is_platform = true`), `organization_members(role_key)`, `roles`, `permissions`, `role_permissions`, `organization_capabilities` (enum `org_capability`).
- Helpers SQL `is_platform_admin`, `is_org_member`, `has_org_permission` sustentam todas as políticas RLS. Platform admins passam em `has_org_permission`.
- Frontend usa o client do navegador; toda autorização é aplicada no banco (RLS + triggers).

## Catálogo mestre × oferta
- `categories`, `brands` (gerenciados pela plataforma), `products` (identidade, `catalog_status`), `product_variants` (SKU + `attributes` jsonb).
- `supplier_offers` (fornecedor × produto, `modalities commercial_modality[]`, `moq`, status de revisão), `supplier_offer_variants` (`supply_cost` por SKU), `grade_compositions` (composição de grade em `items` jsonb).
- Trigger `guard_review_status`: só a plataforma pode mover para `approved/rejected/active`.
- `organization_id` de variantes/grades é derivado da oferta por trigger (nunca confiado do navegador).
- `store_listings`: publicação produto/oferta numa loja com preço próprio, sem duplicar o produto.

## Preço
- `pricing_rules` (somente plataforma): escopo global/fornecedor/categoria/marca/produto/SKU/modalidade/empresa/promoção; tipo percentual/fixo/faixas; prioridade e vigência.
- `resolve_platform_price(offer_variant, modality, buyer_org)` resolve no banco: especificidade › prioridade › mais recente. Retorna custo fornecedor, parcela BemMais e custo do revendedor.

## Estoque
- `inventory_movements` (append-only: in/out/reserve/release/adjust/return) e view `inventory_balances` (security invoker) com `on_hand` e `reserved`.

## Financeiro (fundação)
- `payment_accounts` (gateway recipient ou Pix), `payments`, `payment_allocations` (beneficiários dinâmicos, `via_provider_split`), `receivables`, `payouts`, `ledger_entries` (imutável; correções via `reverses_entry_id`).
- Allocation ≠ payout: beneficiário sem conta integrada gera repasse pendente.
- Escritas financeiras: só plataforma. Leitura por empresa via `finance.read`.
- Adaptador de provedor de pagamento: próxima fase (nenhum gateway integrado).

## IA
- `ai_providers`, `ai_features` (com cota mensal por empresa), `ai_usage_logs` (só metadados).
- `src/lib/ai/providers.server.ts` (abstração) + `gateway.server.ts` (checa recurso, cota, chama provedor, registra uso). Chave em secret `OPENAI_API_KEY`, nunca no banco/navegador.

## Auditoria
- Trigger `audit_row_change` em organizações, membros, capacidades, lojas, produtos, ofertas, custos, regras de preço, estoque, contas, pagamentos, divisões, repasses, razão, IA e configurações.

## Dashboard / Operacional
- `admin_dashboard_metrics(from, to)` e `admin_ops_queue()` — security definer com checagem interna de platform admin.

## Rotas do Super Admin
`/admin` (layout com checagem de acesso) · `operacional` · `empresas` · `clientes` · `fornecedores` · `lojas` · `usuarios` · `produtos` · `categorias` · `marcas` · `ofertas` · `modalidades` · `precos` · `estoque` · `financeiro/*` (visão, transacoes, allocations, recebiveis, repasses, contas, ledger) · `ia` · `permissoes` · `auditoria` · `configuracoes` · `$` (módulos futuros, sem dados).
