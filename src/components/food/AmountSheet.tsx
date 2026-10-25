import { useState } from 'react';
import type { FoodData, FoodUnit } from '../../lib/db';
import { entryTotal, fmt } from '../../lib/nutrition';
import { NumberField } from '../NumberField';

/** Pick how much of a food, see the macros, then add (or update). */
export function AmountSheet({
  food,
  initialQty = 1,
  initialUnit,
  actionLabel = 'Add',
  onSubmit,
  onClose,
  onDelete,
  onSave,
  saved,
}: {
  food: FoodData;
  initialQty?: number;
  initialUnit?: FoodUnit;
  actionLabel?: string;
  onSubmit: (qty: number, unit: FoodUnit) => void;
  onClose: () => void;
  onDelete?: () => void;
  onSave?: () => void;
  saved?: boolean;
}) {
  const startUnit = initialUnit
    ? (food.units.find((u) => u.label === initialUnit.label) ?? initialUnit)
    : food.units[0];
  const units = food.units.some((u) => u.label === startUnit.label) ? food.units : [startUnit, ...food.units];
  const [unitIdx, setUnitIdx] = useState(units.findIndex((u) => u.label === startUnit.label));
  const [qty, setQty] = useState<number | null>(initialQty);
  const unit = units[unitIdx];
  const total = entryTotal(food, qty ?? 0, unit);
  const step = unit.label === 'g' ? 10 : unit.label === 'oz' ? 1 : 0.5;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet amount-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="amount-head">
          <div>
            <h2>{food.name}</h2>
            {food.brand && <div className="muted small">{food.brand}</div>}
          </div>
          {onSave && (
            <button className="link-btn small" onClick={onSave} disabled={saved}>
              {saved ? '★ Saved' : '☆ Save'}
            </button>
          )}
        </div>

        <div className="macro-preview">
          <div>
            <strong>{fmt(total.kcal)}</strong>
            <span>kcal</span>
          </div>
          <div>
            <strong>{Math.round(total.protein)}g</strong>
            <span>protein</span>
          </div>
          <div>
            <strong>{Math.round(total.carbs)}g</strong>
            <span>carbs</span>
          </div>
          <div>
            <strong>{Math.round(total.fat)}g</strong>
            <span>fat</span>
          </div>
        </div>

        <div className="amount-row">
          <button className="round-btn" onClick={() => setQty(Math.max(0, Math.round(((qty ?? 0) - step) * 100) / 100))} aria-label="Less">
            −
          </button>
          <NumberField className="qty-input" label="Amount" value={qty} onChange={setQty} />
          <button className="round-btn" onClick={() => setQty(Math.round(((qty ?? 0) + step) * 100) / 100)} aria-label="More">
            +
          </button>
        </div>
        <select className="unit-select" value={unitIdx} onChange={(e) => setUnitIdx(Number(e.target.value))} aria-label="Unit">
          {units.map((u, i) => (
            <option key={u.label + i} value={i}>
              {u.label}
            </option>
          ))}
        </select>

        <button className="primary" disabled={!qty} onClick={() => qty && onSubmit(qty, unit)}>
          {actionLabel}
        </button>
        {onDelete && (
          <button className="danger-btn" onClick={onDelete}>
            Delete entry
          </button>
        )}
      </div>
    </div>
  );
}
