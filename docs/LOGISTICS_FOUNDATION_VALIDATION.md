# Bloco 8 — logística de preparação

Implementado no código; PostgreSQL real e QA integrado NÃO EXECUTADOS.
Nada aplicado remotamente. Landing e pendências do Bloco 5.2 preservadas.
Skills Supabase/Postgres orientaram grants, RLS e locks.

## Auditoria e domínio

Não havia shipments/packages/quotes/labels/tracking. Existem order_fulfillments,
order_items com owners distintos, snapshot shipping_address e supplier_profiles.ship_origin
(texto livre). Organizations possuem endereço comercial; nenhum desses campos é fonte
automática de origem de expedição. Não duplicamos cadastro comercial/endereço do cliente.

Shipment = preparação de uma remessa física futura, não prova de envio.
Uma remessa por fulfillment, um pedido com múltiplas remessas. Volumes e referências
de itens são estruturas separadas; quote, label, tracking e delivery NÃO são fabricados.
São futuros contratos do adapter backend, sem implementação de SuperFrete ou outro gateway.

## Autoridade e integridade

Preparar exige platform admin, pedido pago confirmado pelo gate verificado do Bloco 7,
fulfillment ready_to_ship com baixa física registrada. Owners e destinatário são copiados
do domínio no banco; frontend envia somente fulfillment_id. Cancelados/não pagos/incertos,
third_party sem responsável e fulfillment incompleto são bloqueados.
Locks order → payments → items → fulfillment → shipment; configuração serializa order,
payments e shipment, verifica estado corrente e versão. UNIQUE fulfillment evita retry
duplicado. Configuração idêntica retorna sucesso sem nova revisão; divergência com versão
antiga falha. Atomicidade, RLS e concorrência reais ainda precisam ser homologadas.

Destinatário é o snapshot histórico, nunca endereço atual. Checkout existente registra
apenas recipient/city; estes pedidos ficam com RECIPIENT_INCOMPLETE e não prontos para
cotação. Não corrigimos silenciosamente nem inventamos CEP/rua/UF/país. Evolução segura
da coleta de endereço é dependência do futuro fluxo logístico, fora deste bloco.
Origem deve ser digitada e confirmada como endereço operacional real pelo Super Admin,
vinculada ao fulfillment owner resolvido; actor/timestamp persistidos, allowlist de campos.
Origem ausente é permitida em draft, mas impede ready_for_quote.

## Volumes e lifecycle

Peso NUMERIC em kg, dimensões NUMERIC em cm. Campos positivos, limites de sanidade
até 1000 kg/cm por volume, até 100 entradas e 100 volumes idênticos por entrada; NÃO são
limites de uma transportadora. Nenhuma medida inicial vem do produto. Exige confirmação
operacional. Quantidade do item é POR volume idêntico; soma quantidade*volumes deve
corresponder integralmente ao fulfillment. Não há remessas parciais nesta fundação.
Sem volumes pode salvar draft; com volumes incompletos/incompatíveis há rollback.
Revisões anteriores e suas composições ficam imutáveis, nunca apagadas por edição.
Audit log existente registra remessa, volumes e alocações de itens (não financeiras).

Métodos iniciais configuráveis: transportadora, correios via provider, retirada, entrega
própria, outra modalidade. configure_shipping_method é admin-only e permite evolução
sem hardcodar transportadora. Seletor usa métodos ativos do banco.
Somente draft ↔ ready_for_quote são operacionais aqui; readiness é calculada no banco.
Sem provider toda cotação/contratação continua indisponível, inclusive ready_for_quote.
Não são expostos botões para estados dependentes de API/evento confiável.

Nenhum estoque, pagamento, allocation, payout ou preço do pedido é alterado.
Saída e reserva consumida continuam exclusivamente no Bloco 7.

## Validação reproduzível pendente

Sem PostgreSQL/psql/Docker/Deno isolados disponíveis; nada instalado.
Node testa helpers/caller/DTO e contratos estáticos, não concorrência PostgreSQL.
tests/sql/logistics-foundation.sql contém asserts de helpers/privileges/schema e protocolo
de RPCs com fixture pós-Bloco7. Executar em Supabase LOCAL DESCARTÁVEL autorizado com
as migrations em ordem, jamais produção. Antes de ativar, validar:

- Pedido pago confirmado/ready_to_ship prepara uma remessa; retry retorna mesmo ID.
- Não pago/cancelado/incerto/third_party inválido/packed rejeitam sem registro parcial.
- Dois fulfillments/owners resultam em remessas independentes; snapshot preservado.
- Volumes múltiplos com composição exata salvam; medidas zero, sem confirmação,
  itens de outro fulfillment, excesso/falta de unidades falham integralmente.
- Origem ausente e destinatário incompleto mantêm draft/pendências explícitas.
- Duas sessões preparando mesmo fulfillment retornam um único shipment.
- Duas configurações com mesma versão e intenções diferentes: uma vence, outra conflita;
  retry igual não cria nova revisão. Conferir audit e ausência de mudança no inventory.
- RLS/grants: anon, buyer e supplier não leem/editam; admin opera apenas via RPC;
  update de status direto e estado delivered/label_created são rejeitados.
- QA do Order360: grupos, diálogo, origem confirmada, volumes/composição, erro de versão,
  loading, histórico e estados vazios. Sem etiqueta/tracking fictícios.
