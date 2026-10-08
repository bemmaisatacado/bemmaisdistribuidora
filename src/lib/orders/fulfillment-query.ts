import { useQuery } from "@tanstack/react-query";
import type { OrderCancellationRpc } from "./cancellation";
import { readFulfillmentContext } from "./fulfillment";

export function useOrderFulfillments(client: OrderCancellationRpc, orderId: string) {
  return useQuery({
    queryKey: ["admin-order-fulfillments", orderId],
    queryFn: async () => {
      const { data, error } = await client.rpc("admin_order_fulfillments", { _order_id: orderId });
      if (error) throw new Error("FULFILLMENT_UNAVAILABLE");
      const result = readFulfillmentContext(data);
      if (!result) throw new Error("FULFILLMENT_UNAVAILABLE");
      return result;
    },
  });
}
