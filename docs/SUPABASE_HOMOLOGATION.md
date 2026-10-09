# Bloco 13 — homologação isolada dos Blocos 3–12

## Estado verificado nesta entrega

- Repositório `bemmaisdistribuidora`, `main`, base `efbb4bb`.
- 34 migrations locais, ordenadas por timestamp; o runner emite nome e SHA-256.
- Configuração principal: `supabase/config.toml`, project_id `pdufhqrfdflwhsfunmpa`.
  Esse identificador NÃO é um ambiente de testes e nunca será alvo do novo runner.
  `.temp/project-ref` ausente; IDs de projeto em `.env` coincidem com a configuração
  principal, não identificam staging.
- `.env` contém referências Supabase usadas pelo frontend/backend. Seus valores
  não foram impressos, copiados, usados para conexão nem carregados pelo runner.
- CLI 2.120.0 disponível via `npx --no-install supabase`; `psql`, `postgres`, Docker,
  Podman e Deno não encontrados no PATH. Nenhuma instalação ou stack iniciada.
  `supabase status --workdir tests/homologation` falhou por Docker indisponível,
  sem rejeição de parsing da configuração e sem conexão SQL. Startup/runtime ainda
  não validados.
- Nenhum staging autorizado identificado. Identidade/permissões/migrations
  efetivamente aplicadas no remoto: **NÃO VERIFICADAS**.
- Os três arquivos pendentes do Bloco 5.2 continuam intactos e fora deste commit.
  O runner antigo usa o project_id principal para nomear o container local; este
  roteiro NÃO o executa nem o modifica.

## Opção recomendada e autorização necessária

Stack Supabase LOCAL descartável, em workspace separado
`tests/homologation`, project_id `bemmais-homologation`, portas 55320–55324.
Docker Desktop é a opção usual no Windows. Podman requer adaptação explícita:
o runner atual aceita somente o daemon Docker local fixo, não contextos remotos.
PostgreSQL puro sem Auth/Storage/roles Supabase não basta para a cadeia completa.

Referências oficiais consultadas: [desenvolvimento local Supabase](https://supabase.com/docs/guides/local-development)
e [psql](https://www.postgresql.org/docs/current/app-psql.html).

**Não executar start, migrations, fixtures ou instalação até o usuário autorizar
explicitamente o ambiente local descartável.** Um staging remoto precisaria de
autorização separada, identidade confirmada e runner específico; este rejeita URLs,
`--linked`, `--db-url` e reset. Não há caminho automático para produção.

## Pré-verificação segura (executada nesta entrega)

```powershell
node scripts/validate-homologation.mjs --check
```

Não conecta a banco, não aplica SQL, não baixa imagens e não instala dependências.
Inventaria hashes e testa executáveis com `--version`. SQL sempre SKIPPED nesse
modo. `--run` sem a confirmação abaixo deve falhar antes de qualquer conexão.

## Execução posterior, somente após autorização

1. Disponibilizar Docker local e confirmar que não há serviço usando essas portas.
   Não reutilizar containers/volumes do principal. Não copiar `.env`, chaves ou dumps
   de produção. Não usar `supabase link`, `db push`, `db reset` ou URL externa.
2. Da raiz deste repositório, iniciar SOMENTE o workspace isolado (esse comando
   pode baixar imagens e aplicar o bootstrap Supabase, portanto exige autorização):

```powershell
docker --host npipe:////./pipe/docker_engine network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 bemmais-homologation
npx --no-install supabase start --workdir tests/homologation --network-id bemmais-homologation
```

Confirmar que as portas ficaram restritas ao loopback. Não expor o banco/Studio à
rede pública; se a rede já existir, inspecionar sua configuração antes de reutilizar.

O workspace não contém migrations copiadas. O runner aplica os 34 arquivos originais
em ordem, sem os editar, em transações por arquivo e com parada na primeira falha.
Recusa `--migrate` se houver qualquer tabela pública; não permite reaplicação ou
reset implícito. Não escreve `supabase_migrations.schema_migrations`: o manifest
PASS/FAIL é o registro da aplicação SQL dessa instância descartável, não história
CLI utilizável para deploy. Se houver falha, não omitir migration nem corrigir
histórico: registrar arquivo/erro localmente e pedir decisão antes de recriar a stack.

3. Confirmar nome E label `com.supabase.cli.project`, banco `postgres`, papel
   `postgres`, PostgreSQL >=15 e Auth Supabase. O runner faz essas verificações
   antes de escrever. A conexão usa `docker exec ... psql`, sem senha/URL externa.

```powershell
$env:BEMMAIS_HOMOLOGATION_ACK = 'DISPOSABLE_LOCAL_BEMMAIS_ONLY'
node scripts/validate-homologation.mjs --run --migrate
Remove-Item Env:BEMMAIS_HOMOLOGATION_ACK
```

Para repetir suites após aplicação bem-sucedida, usar `--run` SEM `--migrate`.
Fixtures sequenciais têm rollback; fixtures concorrentes permanecem apenas no
banco descartável para inspeção. O runner não apaga nada automaticamente.

## Cobertura e critérios (SQL real NÃO EXECUTADO nesta entrega)

| Roteiro | O que deverá comprovar no PostgreSQL |
| --- | --- |
| payment-hardening.sql (pendente, preservado) | Valor histórico, grants/roles, intenção idempotente, eventos repetidos, não regressão, rollback e reservas |
| order-cancellation.sql | Elegibilidade/bloqueios financeiros, cancelamento + liberação |
| order-fulfillment.sql | Grupos/owners, consumo único, saldos, falha multi-item |
| logistics-foundation.sql | Remessas/volumes, origem e destino, autorização |
| checkout-address.sql | Entrega/retirada, snapshot, legado e permissões |
| super-admin-hardening.sql | Checkout/reserva/retry, rascunhos privados, publicação, triggers, slug e isolamento |
| executive-dashboard.sql | Agregações, janela temporal, grants e autorização |
| homologation-security.sql | RLS habilitada nas entidades críticas, schema privado e grants/search_path dos RPCs |

O teste de catálogo de permissões complementa, NÃO substitui os testes com
`SET LOCAL ROLE authenticated` e usuários de organizações distintas nas suites.
Falhas históricas de fixtures, grants ou migrations são FAIL: não devem ser
"corrigidas" via bypass, mocks ou execução como superuser para esconder RLS.

O runner novo usa duas sessões psql simultâneas para pagamentos: duas confirmações
concorrentes só podem deixar um paid/order; o mesmo evento deve ser único;
processing tardio deve falhar e manter paid. As duas chamadas se sobrepõem e seguram
locks por 0,5s, mas não há garantia de qual chega primeiro. Não prova por si só as
outras races operacionais.

### Concorrência de checkout/estoque — procedimento adicional obrigatório

Usar `tests/sql/super-admin-hardening-concurrency.sql` em DUAS sessões do container
isolado. Ele exige `BEMMAIS_ISOLATED_TEST=on`, `actor`, `listing`, `variant`, `slug`,
`key`, `mode`. Os identificadores devem vir de fixtures novas autorizadas no local,
nunca do principal. O script é interativo e NÃO é executado automaticamente.

```powershell
docker --host npipe:////./pipe/docker_engine exec -it supabase_db_bemmais-homologation psql -X -U postgres -d postgres
```

Em ambas as sessões: definir variáveis via `\set`, colar o roteiro. Sessão A usa
`mode=holder`; sessão B `mode=buyer`. Com A mantendo lock no listing, B deve retornar
CHECKOUT_CONCURRENT_CHANGE e deixar zero pedido/reserva. Após rollback de A, retry
de B deve ter sucesso; mesma key deve retornar mesmo pedido/reserva. Para última
unidade: fixture com saldo disponível=1, duas sessões buyer com keys diferentes;
somente uma pode confirmar, outra INSUFFICIENT_STOCK. Verificar ledger e saldos.

Cancelamento versus consumo/liberação e fulfillment versus duplo consumo também
exigem fixtures concorrentes específicas e verificação de rollback. Ainda NÃO
automatizados; manter SKIPPED no aceite até roteiros/cenários reais executados.

## Edge Function no runtime Supabase

Única função atual: `payment-webhook/index.ts`; usa handler `_shared`, sanitizer
e contrato TypeScript em `src/lib/payments`. Registro de verifiers está vazio:
provider desconhecido deve ser rejeitado sem confirmação. Não há gateway real.
Não configurar tokens nem adaptar assinatura fictícia para "aprovar" pagamentos.

Após autorização, copiar SOMENTE fontes necessárias para o workspace ignorado:

```powershell
New-Item -ItemType Directory -Force tests/homologation/supabase/functions,tests/homologation/src/lib | Out-Null
Copy-Item -LiteralPath supabase/functions/payment-webhook -Destination tests/homologation/supabase/functions -Recurse
Copy-Item -LiteralPath supabase/functions/_shared -Destination tests/homologation/supabase/functions -Recurse
Copy-Item -LiteralPath src/lib/payments -Destination tests/homologation/src/lib -Recurse
npx --no-install supabase functions serve payment-webhook --workdir tests/homologation --no-verify-jwt
```

`--no-verify-jwt` é EXCLUSIVO ao teste local da rejeição pública do webhook.
Não usar em deploy por este roteiro. Fontes copiadas preservam imports relativos;
resolução de imports/types e bundle ainda precisam ser validados no runtime real.
Em outro terminal, com a mesma confirmação local:

```powershell
node scripts/validate-homologation.mjs --run --edge
```

O runner verifica também o container Kong/label/porta antes do HTTP local. GET deve
ser 405, POST provider desconhecido 503/PAYMENT_PROVIDER_UNAVAILABLE. Isso comprova
rejeição no runtime, não autenticação de um provider inexistente. Sem assinatura
implementada por adapter real, confirmações públicas permanecem bloqueadas.

## Relatório e aceite

Saída JSON contém manifest SHA-256, PASS/FAIL/SKIPPED por etapa, sem stdout SQL,
stderr interno, credenciais, environment dump ou payload de comprador. Pode ser
salva manualmente em `tests/homologation/reports/` (ignorado). Com falha: exit code1,
etapas seguintes SKIPPED. Tool disponível não significa banco homologado.

Aceite final exige migrations completas, suites SQL e races obrigatórias aprovadas,
Edge runtime validado e QA autenticado dos fluxos. Node/build/tsc/lint aprovados
são evidência local distinta. Não alterar status para homologado enquanto SQL/RLS/
concorrência estiverem SKIPPED. Não aplicar nada no Supabase principal neste bloco.
