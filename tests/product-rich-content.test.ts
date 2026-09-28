import test from "node:test";
import assert from "node:assert/strict";
import { visibleContentBlocks } from "../src/components/storefront/ProductRichContent.tsx";

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
