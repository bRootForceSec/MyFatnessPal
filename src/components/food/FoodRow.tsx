import type { FoodData, FoodUnit } from '../../lib/db';
import { amountText, entryTotal, fmt } from '../../lib/nutrition';

export function FoodRow({
  food,
  qty,
  unit,
  onClick,
  sub,
}: {
  food: FoodData;
  qty?: number;
  unit?: FoodUnit;
  onClick: () => void;
  sub?: string;
}) {
  const u = unit ?? food.units[0];
  const q = qty ?? 1;
  const total = entryTotal(food, q, u);
  return (
    <button className="food-row" onClick={onClick}>
      <span className="food-main">
        <span className="food-name">{food.name}</span>
        <span className="muted small">
          {[food.brand, sub ?? amountText(q, u)].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="food-kcal">
        <strong>{fmt(total.kcal)}</strong>
        <span className="muted small">
          P{Math.round(total.protein)} C{Math.round(total.carbs)} F{Math.round(total.fat)}
        </span>
      </span>
    </button>
  );
}
