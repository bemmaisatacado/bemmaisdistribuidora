import { categoryAttributeCode, normalizeCategoryAttributeOptions } from "./category-attributes.ts";
import { catalogReferenceKey } from "./quick-references.ts";

export const INITIAL_BRANDS = [
  "Nike",
  "Adidas",
  "New Balance",
  "Asics",
  "Vans",
  "Puma",
  "Fila",
  "Mizuno",
  "Olympikus",
  "Reebok",
  "Converse",
  "Under Armour",
] as const;
export const FOOTWEAR_SIZES = [
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
] as const;
export const APPAREL_SIZES = ["PP", "P", "M", "G", "GG", "XG", "XGG"] as const;
export const COMMON_COLORS = [
  "Preto",
  "Branco",
  "Cinza",
  "Bege",
  "Marrom",
  "Azul",
  "Azul-marinho",
  "Verde",
  "Vermelho",
  "Rosa",
  "Roxo",
  "Amarelo",
  "Laranja",
  "Off-white",
  "Caramelo",
] as const;
export const INITIAL_CATEGORY_TREE = {
  Calçados: ["Tênis", "Sapatos", "Sandálias", "Chinelos", "Botas", "Sapatilhas"],
  Vestuário: [
    "Camisetas",
    "Camisas",
    "Calças",
    "Shorts",
    "Bermudas",
    "Moletons",
    "Jaquetas",
    "Vestidos",
    "Saias",
    "Conjuntos",
  ],
  Acessórios: ["Bonés", "Bolsas", "Mochilas", "Carteiras", "Cintos", "Meias"],
} as const;
export const initialAttribute = (name: string, options: readonly string[], isVariant: boolean) => ({
  code: categoryAttributeCode(name),
  options: normalizeCategoryAttributeOptions(options),
  isVariant,
});
export const idempotentMasterNames = (values: readonly string[]) => [
  ...new Map(
    values.map((value) => [catalogReferenceKey(value), value.trim().replace(/\s+/g, " ")]),
  ).values(),
];
