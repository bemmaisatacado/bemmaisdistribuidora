export type ProductMediaPlanItem = {
  id: string;
  sort_order: number;
  is_primary: boolean;
};
export type ProductMediaOrderUpdate = { id: string; sort_order: number };
export type ProductMediaUploadStatus = "pending" | "uploading" | "success" | "error";
export type ProductMediaUploadState = {
  id: string;
  status: ProductMediaUploadStatus;
  message?: string;
};

export const initialProductMediaFields = (mediaCount: number) => ({
  sort_order: mediaCount,
  is_primary: mediaCount === 0,
});

export const primaryProductMediaUpdate = (id: string) => ({ id, is_primary: true });

export const productMediaRemovalPlan = <T extends ProductMediaPlanItem>(
  media: readonly T[],
  id: string,
) => {
  const removed = media.find((item) => item.id === id);
  return {
    promoteId: removed?.is_primary ? (media.find((item) => item.id !== id)?.id ?? null) : null,
  };
};

export const moveProductMedia = <T extends ProductMediaPlanItem>(
  media: readonly T[],
  id: string,
  direction: "up" | "down",
): ProductMediaOrderUpdate[] | null => {
  const index = media.findIndex((item) => item.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= media.length) return null;

  const item = media[index];
  const target = media[targetIndex];
  return [
    { id: item.id, sort_order: target.sort_order },
    { id: target.id, sort_order: item.sort_order },
  ];
};

export const productMediaVariantUpdate = (variantId: string | null) => ({ variant_id: variantId });

export const productMediaUploadErrorMessage = (error: unknown) =>
  error instanceof Error && /10 MB|JPG|PNG|WebP/.test(error.message)
    ? error.message
    : "Não foi possível enviar este arquivo.";

export const updateProductMediaUploadStatus = <T extends ProductMediaUploadState>(
  uploads: readonly T[],
  id: string,
  status: ProductMediaUploadStatus,
  message?: string,
) =>
  uploads.map((upload) =>
    upload.id === id
      ? { ...upload, status, ...(message === undefined ? {} : { message }) }
      : upload,
  );
