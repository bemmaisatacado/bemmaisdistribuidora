export type VisibleContentBlock = { is_visible?: boolean };

export const visibleContentBlocks = <T extends VisibleContentBlock>(blocks: T[]) =>
  blocks.filter((block) => block.is_visible !== false);
