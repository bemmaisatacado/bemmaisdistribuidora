export const storePublicationStatuses = ["draft", "published", "suspended", "archived"] as const;
export type StorePublicationStatus = (typeof storePublicationStatuses)[number];
export const isStorePublicationStatus = (value: string): value is StorePublicationStatus =>
  storePublicationStatuses.some((status) => status === value);

export interface StorePublicationClient {
  rpc(
    name: "change_store_status",
    args: { _store_id: string; _status: StorePublicationStatus },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export async function changeStorePublication(
  client: StorePublicationClient,
  id: string,
  status: StorePublicationStatus,
) {
  const { error } = await client.rpc("change_store_status", { _store_id: id, _status: status });
  if (error)
    throw new Error(
      "Não foi possível alterar a publicação. Confira permissões e o checklist da loja.",
    );
}
