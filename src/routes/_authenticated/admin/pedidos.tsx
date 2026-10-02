import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge, DataTable, PageHeader, Panel } from "@/components/admin/ui";
import { dateTime } from "@/lib/admin/format";
import { readAdminOrderSummaries } from "@/lib/orders/foundation";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({ component: Orders });

function Orders() {
  const orders = useQuery({
    queryKey: ["admin-orders-foundation"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_order_list", { _limit: 50 });
      if (error) throw error;
      return readAdminOrderSummaries(data);
    },
  });
  return (
    <main>
      <PageHeader
        eyebrow="Operação"
        title="Pedidos"
        description="Central de leitura do domínio de pedidos. Checkout, pagamento e fulfillment serão tratados nos fluxos operacionais próprios."
      />
      <Panel
        title="Pedidos recentes"
        description="Dados reais; nenhum pedido é criado ou alterado nesta tela."
      >
        {orders.isError ? (
          <p className="p-5 text-sm text-danger">
            A Central de Pedidos ainda não está disponível neste ambiente. Verifique a migration de
            fundação.
          </p>
        ) : (
          <DataTable
            rowKey={(order) => order.id}
            rows={orders.data}
            loading={orders.isLoading}
            empty="Nenhum pedido registrado. Pedidos serão exibidos aqui após a ativação do checkout."
            columns={[
              { key: "number", label: "Pedido", render: (order) => <b>{order.orderNumber}</b> },
              { key: "buyer", label: "Comprador", render: (order) => order.buyerName ?? "—" },
              { key: "store", label: "Loja", render: (order) => order.storeName ?? "—" },
              { key: "items", label: "Itens", render: (order) => order.itemCount },
              { key: "order", label: "Pedido", render: (order) => <Badge value={order.status} /> },
              {
                key: "payment",
                label: "Pagamento",
                render: (order) => <Badge value={order.paymentStatus} />,
              },
              { key: "date", label: "Criado", render: (order) => dateTime(order.createdAt) },
            ]}
          />
        )}
      </Panel>
    </main>
  );
}
