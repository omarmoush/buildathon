import type { Language } from "./types";

// Furniture categories, styles and materials shared by the quiz, buyer page and landing page.
// Pictures come from /api/catalog/art, which draws the exact category/style/material combination.
export const CATEGORIES = [
  { id: "bed", ar: "سرير", en: "Bed" },
  { id: "nightstand", ar: "كومودينو", en: "Nightstand" },
  { id: "wardrobe", ar: "دولاب", en: "Wardrobe / cupboard" },
  { id: "dresser", ar: "تسريحة", en: "Dresser" },
  { id: "dining-table", ar: "ترابيزة سفرة", en: "Dining table" },
  { id: "dining-chair", ar: "كراسي سفرة", en: "Dining chairs" },
  { id: "sofa", ar: "كنبة", en: "Sofa" },
  { id: "coffee-table", ar: "ترابيزة قهوة", en: "Coffee table" },
] as const;
export const STYLES = [
  { id: "modern", ar: "مودرن", en: "Modern" },
  { id: "classic", ar: "كلاسيك", en: "Classic" },
  { id: "japandi", ar: "ياباني بسيط", en: "Japandi" },
  { id: "scandinavian", ar: "اسكندنافي", en: "Scandinavian" },
] as const;
export const WOOD_LABELS: Record<string, [string, string]> = {
  oak: ["بلوط", "Oak"], beech: ["زان", "Beech"], walnut: ["جوز", "Walnut"], pine: ["صنوبر", "Pine"],
};
export const FINISH_LABELS: Record<string, [string, string]> = {
  natural: ["طبيعي", "Natural"], matte: ["مطفي", "Matte"], white: ["أبيض", "White paint"], walnut: ["صبغة جوز", "Walnut stain"],
};
export const label = (labels: Record<string, [string, string]>, key: string, lang: Language) => labels[key]?.[lang === "ar" ? 0 : 1] ?? key;
export const categoryLabel = (id: string, lang: Language) => {
  const category = CATEGORIES.find(item => item.id === id);
  return category ? category[lang] : id;
};
export const styleLabel = (id: string, lang: Language) => {
  const style = STYLES.find(item => item.id === id);
  return style ? style[lang] : id;
};

// Quiz entry links (?product=) still use the older product types; map them to categories.
export const PRODUCT_PIECES: Record<string, string[]> = {
  "bedroom-set": ["bed", "nightstand", "wardrobe"], "dining-set": ["dining-table", "dining-chair"],
  "living-room": ["sofa", "coffee-table"], wardrobe: ["wardrobe"], other: [],
};
/** The order's product type, derived from the chosen categories (used by estimates and the workshop view). */
export function productTypeFor(pieces: string[]): string {
  const within = (allowed: string[]) => pieces.length > 0 && pieces.every(piece => allowed.includes(piece));
  if (pieces.length === 1 && pieces[0] === "wardrobe") return "wardrobe";
  if (within(["bed", "nightstand", "wardrobe", "dresser"])) return "bedroom-set";
  if (within(["dining-table", "dining-chair"])) return "dining-set";
  if (within(["sofa", "coffee-table"])) return "living-room";
  return "other";
}

const withQuery = (url: string, params: Record<string, string | undefined>) => {
  const [base, existing] = url.split("?");
  const search = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `${base}?${query}` : base!;
};
export const artUrl = (category: string, options: { style?: string; wood?: string; finish?: string } = {}) =>
  withQuery(`/api/catalog/art/${encodeURIComponent(category)}.svg`, options);
/** Our generated catalog models and pictures can be recoloured; uploaded photos and Meshy models cannot. */
export const recolorable = (url?: string) => !!url && /^\/api\/catalog\/(fallback|custom|thumbnail|art)\//.test(url);
export const recolor = (url: string | undefined, options: { wood?: string; finish?: string; style?: string }) =>
  url && recolorable(url) ? withQuery(url, options) : url;

const WOOD_HEX: Record<string, string> = { oak: "#b07c4f", beech: "#d6ae7f", walnut: "#6a452a", pine: "#dfbf88" };
const FINISH_HEX: Record<string, string> = { white: "#eee8de", walnut: "#5e3d25" };
/** Swatch colour; mirrors woodHex() on the server. */
export const swatch = (wood: string, finish = "natural") => FINISH_HEX[finish] ?? WOOD_HEX[wood] ?? WOOD_HEX.oak;
