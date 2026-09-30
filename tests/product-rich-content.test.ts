import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicateContentBlockPosition,
  moveContentBlock,
  visibleContentBlocks,
} from "../src/lib/product-rich-content.ts";
import {
  initialProductMediaFields,
  moveProductMedia,
  primaryProductMediaUpdate,
  productMediaRemovalPlan,
  productMediaUploadErrorMessage,
  productMediaVariantUpdate,
  updateProductMediaUploadStatus,
} from "../src/lib/catalog/product-media.ts";

const safeHref = (href?: string) =>
  href && (/^https?:\/\//.test(href) || href.startsWith("/")) ? href : undefined;
const benefits = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item): { title: string; text: string }[] =>
        typeof item === "object" &&
        item !== null &&
        "title" in item &&
        typeof item.title === "string"
          ? [
              {
                title: item.title,
                text: "text" in item && typeof item.text === "string" ? item.text : "",
              },
            ]
          : [],
      )
    : [];
const faqs = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item): { question: string; answer: string }[] =>
        typeof item === "object" &&
        item !== null &&
        "question" in item &&
        typeof item.question === "string"
          ? [
              {
                question: item.question,
                answer: "answer" in item && typeof item.answer === "string" ? item.answer : "",
              },
            ]
          : [],
      )
    : [];
const addColumn = (rows: string[][]) => (rows.length ? rows.map((row) => [...row, ""]) : [[""]]);
const removeColumn = (rows: string[][], column: number) =>
  rows.map((row) => row.filter((_, i) => i !== column));

test("content links allow HTTP(S) and internal paths only", () => {
  assert.equal(safeHref("https://x.test"), "https://x.test");
  assert.equal(safeHref("/produto"), "/produto");
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref("data:text/plain,x"), undefined);
});
test("benefits and FAQ narrow persisted JSON safely", () => {
  assert.deepEqual(benefits([{ title: "Leveza" }, { title: 1 }]), [{ title: "Leveza", text: "" }]);
  assert.deepEqual(faqs([{ question: "Entrega?" }, { answer: "x" }]), [
    { question: "Entrega?", answer: "" },
  ]);
});
test("size guide column operations keep rows consistent", () => {
  const rows = [
    ["Tamanho", "Medida"],
    ["M", "90"],
  ];
  assert.deepEqual(addColumn(rows), [
    ["Tamanho", "Medida", ""],
    ["M", "90", ""],
  ]);
  assert.deepEqual(removeColumn(addColumn(rows), 1), [
    ["Tamanho", ""],
    ["M", ""],
  ]);
});
test("visible rich-content blocks preserve order and omit hidden blocks", () => {
  const blocks = [
    { id: "a", type: "text", config: {}, is_visible: true },
    { id: "b", type: "text", config: {}, is_visible: false },
    { id: "c", type: "text", config: {}, is_visible: true },
  ];
  assert.deepEqual(
    visibleContentBlocks(blocks).map((block) => block.id),
    ["a", "c"],
  );
});

const orderedBlocks = [
  {
    id: "a",
    product_id: "product-1",
    type: "text",
    config: { title: "A" },
    is_visible: true,
    position: 0,
  },
  {
    id: "b",
    product_id: "product-1",
    type: "faq",
    config: { items: [] },
    is_visible: false,
    position: 1,
  },
  { id: "c", product_id: "product-1", type: "spacer", config: {}, is_visible: true, position: 2 },
];

test("moves a content block up by swapping only positions", () => {
  assert.deepEqual(moveContentBlock(orderedBlocks, "b", "up"), [
    { id: "b", position: 0 },
    { id: "a", position: 1 },
  ]);
  assert.equal(moveContentBlock(orderedBlocks, "a", "up"), null);
  assert.deepEqual(orderedBlocks[1], {
    id: "b",
    product_id: "product-1",
    type: "faq",
    config: { items: [] },
    is_visible: false,
    position: 1,
  });
});

test("moves a content block down by swapping only positions", () => {
  assert.deepEqual(moveContentBlock(orderedBlocks, "b", "down"), [
    { id: "b", position: 2 },
    { id: "c", position: 1 },
  ]);
  assert.equal(moveContentBlock(orderedBlocks, "c", "down"), null);
});

test("opens an adjacent position for a duplicated content block", () => {
  const plan = duplicateContentBlockPosition(orderedBlocks, "b");
  assert.deepEqual(plan, {
    copyPosition: 2,
    positionUpdates: [{ id: "c", position: 3 }],
  });
  assert.ok(plan);
  const positions = [
    ...orderedBlocks.map(
      (block) =>
        plan.positionUpdates.find((update) => update.id === block.id)?.position ?? block.position,
    ),
    plan.copyPosition,
  ];
  assert.equal(new Set(positions).size, positions.length);
  assert.equal(duplicateContentBlockPosition(orderedBlocks, "missing"), null);
});

const productMedia = [
  { id: "media-a", sort_order: 0, is_primary: true, variant_id: null },
  { id: "media-b", sort_order: 1, is_primary: false, variant_id: "variant-black" },
  { id: "media-c", sort_order: 2, is_primary: false, variant_id: null },
];

test("plans product media primary, promotion, ordering, and variant association", () => {
  assert.deepEqual(initialProductMediaFields(0), { sort_order: 0, is_primary: true });
  assert.deepEqual(initialProductMediaFields(2), { sort_order: 2, is_primary: false });
  assert.deepEqual(primaryProductMediaUpdate("media-b"), { id: "media-b", is_primary: true });
  assert.deepEqual(productMediaRemovalPlan(productMedia, "media-a"), { promoteId: "media-b" });
  assert.deepEqual(productMediaRemovalPlan(productMedia, "media-b"), { promoteId: null });
  assert.deepEqual(moveProductMedia(productMedia, "media-b", "up"), [
    { id: "media-b", sort_order: 0 },
    { id: "media-a", sort_order: 1 },
  ]);
  assert.deepEqual(moveProductMedia(productMedia, "media-b", "down"), [
    { id: "media-b", sort_order: 2 },
    { id: "media-c", sort_order: 1 },
  ]);
  assert.equal(moveProductMedia(productMedia, "media-a", "up"), null);
  assert.equal(moveProductMedia(productMedia, "media-c", "down"), null);
  assert.deepEqual(productMediaVariantUpdate("variant-black"), { variant_id: "variant-black" });
  assert.deepEqual(productMediaVariantUpdate(null), { variant_id: null });
});

test("tracks individual product media upload states without propagating failures", () => {
  const pending = [
    { id: "a", status: "pending" as const },
    { id: "b", status: "pending" as const },
    { id: "c", status: "pending" as const },
  ];
  const uploading = pending.map((item) => ({ ...item, status: "uploading" as const }));
  const completed = updateProductMediaUploadStatus(
    updateProductMediaUploadStatus(
      updateProductMediaUploadStatus(uploading, "a", "success", "Concluído"),
      "b",
      "error",
      "Cada imagem pode ter no máximo 10 MB.",
    ),
    "c",
    "success",
    "Concluído",
  );
  assert.deepEqual(completed, [
    { id: "a", status: "success", message: "Concluído" },
    { id: "b", status: "error", message: "Cada imagem pode ter no máximo 10 MB." },
    { id: "c", status: "success", message: "Concluído" },
  ]);
});

test("uses safe product media upload messages", () => {
  assert.equal(
    productMediaUploadErrorMessage(new Error("Cada imagem pode ter no máximo 10 MB.")),
    "Cada imagem pode ter no máximo 10 MB.",
  );
  assert.equal(
    productMediaUploadErrorMessage(new Error("storage response details")),
    "Não foi possível enviar este arquivo.",
  );
});
