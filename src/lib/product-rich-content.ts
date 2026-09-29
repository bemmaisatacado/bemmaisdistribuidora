export type VisibleContentBlock = { is_visible?: boolean };
export type PositionedContentBlock = { id: string; position: number };
export type ContentBlockPositionUpdate = { id: string; position: number };
export type DuplicateContentBlockPositionPlan = {
  copyPosition: number;
  positionUpdates: ContentBlockPositionUpdate[];
};

export const visibleContentBlocks = <T extends VisibleContentBlock>(blocks: T[]) =>
  blocks.filter((block) => block.is_visible !== false);

export const moveContentBlock = <T extends PositionedContentBlock>(
  blocks: readonly T[],
  id: string,
  direction: "up" | "down",
): ContentBlockPositionUpdate[] | null => {
  const index = blocks.findIndex((block) => block.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= blocks.length) return null;

  const block = blocks[index];
  const target = blocks[targetIndex];
  return [
    { id: block.id, position: target.position },
    { id: target.id, position: block.position },
  ];
};

export const duplicateContentBlockPosition = <T extends PositionedContentBlock>(
  blocks: readonly T[],
  id: string,
): DuplicateContentBlockPositionPlan | null => {
  const original = blocks.find((block) => block.id === id);
  if (!original) return null;

  return {
    copyPosition: original.position + 1,
    positionUpdates: blocks
      .filter((block) => block.position > original.position)
      .sort((left, right) => right.position - left.position)
      .map((block) => ({ id: block.id, position: block.position + 1 })),
  };
};
