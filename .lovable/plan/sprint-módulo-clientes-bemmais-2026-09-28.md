# Sprint — Módulo Clientes BemMais

Cliente = organization existente + camada comercial privada da BemMais. Nada de nome, documento, endereço, usuários, lojas ou capacidades duplicados.

## 1. Banco (uma migration)
- `customer_relationships` (1:1 com organization): status comercial (enum `novo, onboarding, ativo, inativo, em_risco` — separado do status técnico), responsável BemMais, origem do lead, próxima ação + data + responsável, "cliente desde".
- `customer_interactions`: tipo (ligação, WhatsApp, reunião, observação, follow-up, outro), nota, autor, data, próxima ação/data opcionais.
- `customer_followups`: tarefa com responsável, vencimento, status aberto/concluído, concluído em/por.
- Nova capacidade `own_inventory` (Estoque próprio) no enum existente — continua capability, nunca role.
- RLS: as três tabelas visíveis e editáveis só pela equipe da plataforma (`is_platform_admin`); cliente nunca vê.
- Trigger `audit_row_change` nas três tabelas (responsável alterado, status alterado, nota, follow-up criado/concluído).
- RPCs (security definer com checagem interna de platform admin, `EXECUTE` revogado de `anon`): `admin_customer_stats`, `admin_search_customers` (busca nome/razão/CPF-CNPJ/WhatsApp/e-mail; filtros status técnico e comercial, responsável, origem, tags, capacidades, possui loja/loja ativa, UF/cidade, período), `customer_360(org)` (relacionamento, operação, financeiro, pendências e jornada calculadas a partir de dados reais), `admin_customer_queues` (follow-ups vencidos, onboarding, convites pendentes, cadastros incompletos, lojas em rascunho).
- Corrigir também os avisos de segurança da migration anterior (revogar `EXECUTE` de `anon`/`public` onde houver, manter checagem interna).

## 2. Central de Clientes (`/admin/clientes`)
- Header "CLIENTES BEMMAIS", subtítulo e CTA "+ Novo cliente".
- 8 indicadores reais (Total, Ativos, Novos no período, Com loja, Drop, Atacado, Com pendências, Inativos).
- Busca + filtros combináveis no servidor; chips de segmentação prontos (Drop, Grade, Variado, com/sem loja, UF, tag, responsável). Compras/faturamento aparecem como "disponível quando Pedidos existir", sem dados falsos.
- Visão cards e lista, com status comercial, responsável, próxima ação (vencida em destaque).

## 3. Novo cliente (`/admin/clientes/novo`) — 6 passos
Identificação (PF/PJ, CPF/CNPJ validado, e-mail, WhatsApp) → Como pretende operar (múltipla escolha → capacidades) → Perfil comercial (origem, responsável, tags, observações) → Acesso (só cadastro ou convite via fluxo `inviteMember` existente) → Loja (sim/não, reaproveita `CreateStoreModal`) → Revisão. Cria uma única organization + relacionamento.

## 4. Perfil do cliente (`/admin/clientes/$orgId?tab=…`)
- EntityHeader com badges das capacidades reais, responsável e ações (Editar, Criar/abrir loja, Convite, Capacidades, Nota, Mais ações).
- Abas: Resumo (Customer 360 + Jornada + Pendências + atividade recente), Relacionamento (CRM leve: status, responsável, próxima ação, registrar contato, follow-ups, timeline, notas internas), Loja, Produtos, Compras, Vendas, Financeiro, Usuários, Permissões/Capacidades, Atividade.
- Jornada: Cadastrado → Acesso ativado → Loja criada → Primeiro produto → Primeiro pedido → Cliente ativo → Em crescimento; só marca com evidência real, estágios de módulos futuros ficam pendentes.
- Reutiliza abas existentes do módulo Empresas (dados, usuários, lojas, financeiro, atividade, notas/tags) em vez de duplicar.

## 5. Central Operacional
Novas filas reais: follow-ups vencidos, clientes em onboarding, convites pendentes, cadastros incompletos, lojas em rascunho — com link direto ao perfil.

## Fora do escopo
Pedidos, gateway, logística, portal do fornecedor, campanhas de marketing, painel do cliente.

## Verificação
Typecheck, lint/format, build e abertura das páginas. Fluxos com login precisam ser testados por você no preview (este ambiente não consegue entrar no seu Supabase); a entrega listará exatamente o que foi e o que não foi testado.
