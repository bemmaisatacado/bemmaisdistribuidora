# Bloco 9 — endereços

Migration incremental: `20261009001556_complete_checkout_addresses.sql`. Não aplicada remotamente.

Entrega exige endereço brasileiro completo validado no banco. CEP tem validação estrutural, não consulta postal; não se afirma existência geográfica. S/N exige `no_number: "true"` e número vazio. Campos adicionais desconhecidos são descartados. Retirada depende de `stores.allow_pickup` autorizado e começa desabilitada; o endereço de entrega não é coletado nessa modalidade.

Snapshot original é imutável. Legados incompletos continuam bloqueados para cotação. Super Admin registra revisão operacional separada via `correct_legacy_order_address`; motivo enumerado, ator, data, revisão esperada e retry idempotente. Remessas utilizam destino efetivo autorizado sem editar seu snapshot original. Cadastro atual nunca substitui destino. Correção invalida preparação logística para nova conferência. Auditoria futura remove endereços; registros históricos anteriores não são alterados.

Leitura de pedidos com PII limitada a comprador autenticado e platform admin. Não há permissão automática por simples vínculo à organização. Integrações futuras de operação tenant devem receber permissão explícita e DTO mínimo.

Checkout preserva locks, preço histórico, reservas e transação existentes. Fingerprint persistente inclui intenção/endereço: repetição igual retorna pedido; mudança conflita. Tentativas antigas sem fingerprint não podem ser reutilizadas para outra intenção.

## Validação isolada pendente

PostgreSQL real NÃO EXECUTADO. Testes Node de contratos SQL são inspeção estática, não homologação.
Verificação TypeScript global adicional encontrou erros preexistentes em `order-360.ts` e no Link de catálogo do carrinho (ambos presentes no HEAD inicial); não houve limpeza de módulos fora do escopo. Build e lint direcionado passam.
Em banco isolado autorizado, aplicar cadeia completa de migrations localmente e executar `psql -v ON_ERROR_STOP=1 -f tests/sql/checkout-address.sql`.

Ainda homologar com fixtures autenticadas: checkout completo/retirada autorizada, rollback com endereço inválido, retry igual/divergente, reservas/valores preservados, update snapshot negado, alteração de cadastro sem efeito, correções simultâneas/versionadas, origem e destino antes de prontidão, RLS comprador/outro comprador/membro/admin, auditoria sem endereço. Nunca usar produção ou imprimir credenciais.
