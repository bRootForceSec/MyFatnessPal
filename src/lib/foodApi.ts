import type { FoodData, FoodUnit, Macros } from './db';
import { GRAM, OUNCE, SERVING } from './nutrition';

/* ---------- USDA FoodData Central ---------- */

const USDA_KEY_STORAGE = 'mfp.usdaKey';

export function usdaKey(): string {
  const env = import.meta.env.VITE_USDA_API_KEY as string | undefined;
  if (env) return env;
  try {
    return localStorage.getItem(USDA_KEY_STORAGE) || 'DEMO_KEY';
  } catch {
    return 'DEMO_KEY';
  }
}

export function setUsdaKey(k: string): void {
  if (k.trim()) localStorage.setItem(USDA_KEY_STORAGE, k.trim());
  else localStorage.removeItem(USDA_KEY_STORAGE);
}

export function usdaKeyFromBuild(): boolean {
  return Boolean(import.meta.env.VITE_USDA_API_KEY);
}

interface UsdaNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: UsdaNutrient[];
  foodMeasures?: { disseminationText?: string; gramWeight?: number }[];
}

function nutrient(f: UsdaFood, ids: number[], numbers: string[], unit?: string): number | null {
  for (const n of f.foodNutrients ?? []) {
    const match = (n.nutrientId != null && ids.includes(n.nutrientId)) || (n.nutrientNumber != null && numbers.includes(n.nutrientNumber));
    if (match && n.value != null && (!unit || !n.unitName || n.unitName.toUpperCase() === unit)) return n.value;
  }
  return null;
}

/** "GREEK YOGURT, PLAIN" -> "Greek Yogurt, Plain". Leaves mixed-case text alone. */
export function tidyName(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function parseUsda(f: UsdaFood): FoodData | null {
  const kcal = nutrient(f, [1008, 2047, 2048], ['208', '957', '958'], 'KCAL');
  if (kcal == null) return null;
  const macros: Macros = {
    kcal,
    protein: nutrient(f, [1003], ['203']) ?? 0,
    fat: nutrient(f, [1004], ['204']) ?? 0,
    carbs: nutrient(f, [1005], ['205']) ?? 0,
  };
  const units: FoodUnit[] = [];
  const su = (f.servingSizeUnit ?? '').toLowerCase();
  if (f.servingSize && ['g', 'grm', 'ml', 'mlt'].includes(su)) {
    const g = Math.round(f.servingSize * 10) / 10;
    const label = f.householdServingFullText ? `${f.householdServingFullText.toLowerCase()} (${g} g)` : `serving (${g} g)`;
    units.push({ label, amount: f.servingSize });
  }
  for (const m of f.foodMeasures ?? []) {
    if (!m.gramWeight || !m.disseminationText || /not specified/i.test(m.disseminationText)) continue;
    units.push({ label: `${m.disseminationText} (${Math.round(m.gramWeight)} g)`, amount: m.gramWeight });
  }
  units.push(GRAM, OUNCE);
  return {
    name: tidyName(f.description),
    brand: f.brandName || f.brandOwner ? tidyName(f.brandName || f.brandOwner || '') : undefined,
    basis: 'g',
    macros,
    units,
    barcode: f.gtinUpc || undefined,
    source: 'usda',
    source_id: `usda:${f.fdcId}`,
  };
}

const USDA = 'https://api.nal.usda.gov/fdc/v1';

export async function searchUsda(query: string, signal?: AbortSignal): Promise<FoodData[]> {
  const url = `${USDA}/foods/search?api_key=${encodeURIComponent(usdaKey())}&query=${encodeURIComponent(query)}&pageSize=25&dataType=${encodeURIComponent('Foundation,SR Legacy,Branded')}`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new Error('USDA search limit reached. Add your own free API key in Settings.');
  if (!res.ok) throw new Error(`USDA search failed (${res.status})`);
  const json = (await res.json()) as { foods?: UsdaFood[] };
  return (json.foods ?? []).map(parseUsda).filter((x): x is FoodData => x != null);
}

/* ---------- Open Food Facts ---------- */

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function parseOff(p: OffProduct): FoodData | null {
  const n = p.nutriments ?? {};
  const name = p.product_name?.trim();
  if (!name) return null;
  const brand = p.brands?.split(',')[0]?.trim() || undefined;
  const per100 = (k: string) => num(n[`${k}_100g`]);
  const perServ = (k: string) => num(n[`${k}_serving`]);
  let kcal100 = per100('energy-kcal');
  if (kcal100 == null && per100('energy') != null) kcal100 = per100('energy')! / 4.184;
  const servingG = num(p.serving_quantity);

  if (kcal100 != null) {
    const units: FoodUnit[] = [];
    if (servingG) units.push({ label: `serving (${p.serving_size ?? `${servingG} g`})`, amount: servingG });
    units.push(GRAM, OUNCE);
    return {
      name,
      brand,
      basis: 'g',
      macros: { kcal: kcal100, protein: per100('proteins') ?? 0, carbs: per100('carbohydrates') ?? 0, fat: per100('fat') ?? 0 },
      units,
      barcode: p.code,
      source: 'off',
      source_id: p.code ? `off:${p.code}` : undefined,
    };
  }
  const kcalServ = perServ('energy-kcal');
  if (kcalServ == null) return null;
  return {
    name,
    brand,
    basis: 'serving',
    macros: { kcal: kcalServ, protein: perServ('proteins') ?? 0, carbs: perServ('carbohydrates') ?? 0, fat: perServ('fat') ?? 0 },
    units: [{ label: p.serving_size ? `serving (${p.serving_size})` : 'serving', amount: 1 }],
    barcode: p.code,
    source: 'off',
    source_id: p.code ? `off:${p.code}` : undefined,
  };
}

const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,brands,serving_size,serving_quantity,nutriments';

export async function searchOff(query: string, signal?: AbortSignal): Promise<FoodData[]> {
  const url =
    `${OFF}/cgi/search.pl?action=process&json=1&search_simple=1&page_size=20` +
    `&search_terms=${encodeURIComponent(query)}&fields=${OFF_FIELDS}` +
    `&tagtype_0=countries&tag_contains_0=contains&tag_0=united-states`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Food Facts search failed (${res.status})`);
  const json = (await res.json()) as { products?: OffProduct[] };
  return (json.products ?? []).map(parseOff).filter((x): x is FoodData => x != null);
}

/** Barcodes come as UPC-A (12 digits) or EAN-13 (13); compare without leading zeros. */
export const sameBarcode = (a: string, b: string) => a.replace(/^0+/, '') === b.replace(/^0+/, '');

/** Look a barcode up in Open Food Facts, then USDA branded foods. */
export async function lookupBarcode(code: string): Promise<FoodData | null> {
  try {
    const res = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
    if (res.ok) {
      const json = (await res.json()) as { status?: number; product?: OffProduct };
      if (json.status === 1 && json.product) {
        const f = parseOff({ ...json.product, code });
        if (f) return f;
      }
    }
  } catch {
    /* fall through to USDA */
  }
  const url = `${USDA}/foods/search?api_key=${encodeURIComponent(usdaKey())}&query=${encodeURIComponent(code)}&dataType=Branded&pageSize=10`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { foods?: UsdaFood[] };
  const hit = (json.foods ?? []).find((f) => f.gtinUpc && sameBarcode(f.gtinUpc, code));
  return hit ? parseUsda(hit) : null;
}

export { SERVING };
