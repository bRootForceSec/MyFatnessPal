import { useState } from 'react';
import type { FoodData, FoodUnit, Macros, RecipeIngredient } from '../../lib/db';
import { add, amountText, entryTotal, fmt, GRAM, OUNCE, scale, ZERO } from '../../lib/nutrition';
import { NumberField } from '../NumberField';

type MacroInputs = { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };

function MacroFields({ m, set }: { m: MacroInputs; set: (m: MacroInputs) => void }) {
  const f = (k: keyof MacroInputs, label: string) => (
    <label className="mini-field">
      <span>{label}</span>
      <NumberField label={label} value={m[k]} onChange={(v) => set({ ...m, [k]: v })} />
    </label>
  );
  return (
    <div className="macro-fields">
      {f('kcal', 'Calories')}
      {f('protein', 'Protein g')}
      {f('carbs', 'Carbs g')}
      {f('fat', 'Fat g')}
    </div>
  );
}

const toMacros = (m: MacroInputs): Macros => ({
  kcal: m.kcal ?? 0,
  protein: m.protein ?? 0,
  carbs: m.carbs ?? 0,
  fat: m.fat ?? 0,
});

/** Log calories (and optionally macros) without picking a food. */
export function QuickAdd({ onAdd }: { onAdd: (food: FoodData) => void }) {
  const [name, setName] = useState('');
  const [m, setM] = useState<MacroInputs>({ kcal: null, protein: null, carbs: null, fat: null });
  return (
    <div className="stack pad">
      <MacroFields m={m} set={setM} />
      <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <button
        className="primary"
        disabled={!m.kcal && !m.protein && !m.carbs && !m.fat}
        onClick={() => {
          const macros = toMacros(m);
          if (!m.kcal) macros.kcal = macros.protein * 4 + macros.carbs * 4 + macros.fat * 9;
          onAdd({ name: name.trim() || 'Quick add', basis: 'serving', macros, units: [{ label: 'serving', amount: 1 }], source: 'quick' });
        }}
      >
        Add
      </button>
    </div>
  );
}

/** Create or edit your own food from a nutrition label. */
export function CustomFoodForm({
  initial,
  barcode,
  onSave,
  onCancel,
}: {
  initial?: FoodData;
  barcode?: string;
  onSave: (food: FoodData) => void;
  onCancel: () => void;
}) {
  const servingUnit = initial?.basis === 'g' ? initial.units.find((u) => u.label !== 'g' && u.label !== 'oz') : undefined;
  const perServing = initial ? (initial.basis === 'g' && servingUnit ? scale(initial.macros, servingUnit.amount / 100) : initial.macros) : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [serving, setServing] = useState(
    (servingUnit?.label ?? initial?.units[0]?.label ?? 'serving').replace(/\s*\(.*\)$/, ''),
  );
  const [grams, setGrams] = useState<number | null>(servingUnit?.amount ?? null);
  const [m, setM] = useState<MacroInputs>(
    perServing
      ? { kcal: Math.round(perServing.kcal), protein: round1(perServing.protein), carbs: round1(perServing.carbs), fat: round1(perServing.fat) }
      : { kcal: null, protein: null, carbs: null, fat: null },
  );

  function save() {
    const macros = toMacros(m);
    const label = serving.trim() || 'serving';
    const food: FoodData = grams
      ? {
          name: name.trim(),
          brand: brand.trim() || undefined,
          basis: 'g',
          macros: scale(macros, 100 / grams),
          units: [{ label: `${label} (${grams} g)`, amount: grams }, GRAM, OUNCE],
          barcode: barcode ?? initial?.barcode,
          source: 'custom',
        }
      : {
          name: name.trim(),
          brand: brand.trim() || undefined,
          basis: 'serving',
          macros,
          units: [{ label, amount: 1 }],
          barcode: barcode ?? initial?.barcode,
          source: 'custom',
        };
    onSave(food);
  }

  return (
    <div className="stack pad">
      {barcode && <p className="muted small">Barcode {barcode} wasn't found. Add it from the label and it'll be remembered.</p>}
      <input placeholder="Food name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
      <div className="field-row">
        <label className="field">
          <span>Serving size</span>
          <input value={serving} onChange={(e) => setServing(e.target.value)} placeholder="e.g. 1 bar, 2 tbsp" />
        </label>
        <label className="field">
          <span>Grams per serving (optional)</span>
          <NumberField label="Grams per serving" value={grams} onChange={setGrams} />
        </label>
      </div>
      <p className="muted small">Nutrition per serving:</p>
      <MacroFields m={m} set={setM} />
      <button className="primary" disabled={!name.trim() || m.kcal == null} onClick={save}>
        Save food
      </button>
      <button className="link-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function recipeTotal(ings: RecipeIngredient[]): Macros {
  return ings.reduce((acc, i) => add(acc, entryTotal(i.food, i.qty, i.unit)), ZERO);
}

/** A recipe or saved meal: a list of foods, split into servings. */
export function RecipeForm({
  name,
  setName,
  servings,
  setServings,
  onPickIngredient,
  ingredients,
  setIngredients,
  onSave,
  onCancel,
}: {
  name: string;
  setName: (n: string) => void;
  servings: number | null;
  setServings: (n: number | null) => void;
  ingredients: RecipeIngredient[];
  setIngredients: (i: RecipeIngredient[]) => void;
  onPickIngredient: () => void;
  onSave: (food: FoodData & { ingredients: RecipeIngredient[]; yield_servings: number }) => void;
  onCancel: () => void;
}) {
  const total = recipeTotal(ingredients);
  const per = scale(total, 1 / (servings || 1));
  return (
    <div className="stack pad">
      <input placeholder="Recipe or meal name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="ingredients">
        {ingredients.map((i, idx) => (
          <div key={idx} className="ingredient">
            <span>
              {i.food.name}
              <span className="muted small"> · {amountText(i.qty, i.unit)}</span>
            </span>
            <span className="muted small">{fmt(entryTotal(i.food, i.qty, i.unit).kcal)} kcal</span>
            <button className="icon-btn small" onClick={() => setIngredients(ingredients.filter((_, j) => j !== idx))} aria-label="Remove">
              ×
            </button>
          </div>
        ))}
        <button className="secondary" onClick={onPickIngredient}>
          + Add ingredient
        </button>
      </div>
      <label className="field">
        <span>Makes how many servings? (1 for a saved meal)</span>
        <NumberField label="Servings" value={servings} onChange={setServings} />
      </label>
      <p className="small">
        Per serving: <strong>{fmt(per.kcal)} kcal</strong> · P{Math.round(per.protein)} C{Math.round(per.carbs)} F{Math.round(per.fat)}
      </p>
      <button
        className="primary"
        disabled={!name.trim() || ingredients.length === 0 || !servings}
        onClick={() =>
          onSave({
            name: name.trim(),
            basis: 'serving',
            macros: per,
            units: [{ label: 'serving', amount: 1 } as FoodUnit],
            source: 'recipe',
            ingredients,
            yield_servings: servings!,
          })
        }
      >
        Save recipe
      </button>
      <button className="link-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
