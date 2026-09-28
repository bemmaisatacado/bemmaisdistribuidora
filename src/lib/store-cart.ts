import { cartTotal, changeCartQuantity, type CartItem } from "./storefront";
export type PersistedCart = { storeSlug: string; items: CartItem[] };
const key=(slug:string)=>`bemmais:cart:${slug}`;
export function readCart(slug:string):PersistedCart { try { const x=JSON.parse(localStorage.getItem(key(slug))??"null"); return x?.storeSlug===slug&&Array.isArray(x.items)?x:{storeSlug:slug,items:[]}; } catch { return {storeSlug:slug,items:[]}; } }
export function writeCart(cart:PersistedCart){ localStorage.setItem(key(cart.storeSlug),JSON.stringify(cart)); }
export { cartTotal, changeCartQuantity };
