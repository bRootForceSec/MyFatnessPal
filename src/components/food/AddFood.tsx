import { useEffect, useRef, useState } from 'react';
import { db, type Food, type FoodData, type FoodUnit, type RecipeIngredient } from '../../lib/db';
import { lookupBarcode, sameBarcode, searchOff, searchUsda } from '../../lib/foodApi';
import { logFood, saveFood, useRecents, useSavedFoods } from '../../lib/foodData';
import { deleteRecord } from '../../lib/records';
import { BackIcon } from '../Icons';
import { AmountSheet } from './AmountSheet';
import { CustomFoodForm, QuickAdd, RecipeForm } from './FoodForms';
import { FoodRow } from './FoodRow';
import { Scanner } from './Scanner';

type Tab = 'recent' | 'mine' | 'quick';
type Picked = { food: FoodData; food_id?: string; qty?: number; unit?: FoodUnit };

/** Everything for adding food: recent, my foods, search, scan, quick add, custom foods and recipes. */
export function AddFood({ date, onClose }: { date: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('recent');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lookup, setLookup] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ barcode?: string; edit?: Food } | null>(null);
  const [recipe, setRecipe] = useState<{ edit?: Food; name: string; servings: number | null; ingredients: RecipeIngredient[] } | null>(null);
  const [pickingIngredient, setPickingIngredient] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  async function onCode(code: string) {
    setScanning(false);
    setLookup(code);
    const local = await db.foods.filter((f) => !f.deleted && !!f.barcode && sameBarcode(f.barcode, code)).first();
    if (local) {
      setLookup(null);
      return setPicked({ food: local, food_id: local.id });
    }
    try {
      const found = navigator.onLine ? await lookupBarcode(code) : null;
      setLookup(null);
      if (found) setPicked({ food: { ...found, barcode: code } });
      else setCustom({ barcode: code });
    } catch {
      setLookup(null);
      setCustom({ barcode: code });
    }
  }

  // Sub-screens
  if (scanning) return <Scanner onCode={onCode} onClose={() => setScanning(false)} />;

  if (custom) {
    return (
      <Overlay title={custom.edit ? 'Edit food' : 'New food'} onBack={() => setCustom(null)}>
        <CustomFoodForm
          initial={custom.edit}
          barcode={custom.barcode}
          onCancel={() => setCustom(null)}
          onSave={async (food) => {
            const id = await saveFood(food, custom.edit?.id);
            setCustom(null);
            if (!custom.edit) setPicked({ food, food_id: id });
          }}
        />
      </Overlay>
    );
  }

  if (recipe && !pickingIngredient) {
    return (
      <Overlay title={recipe.edit ? 'Edit recipe' : 'New recipe or meal'} onBack={() => setRecipe(null)}>
        <RecipeForm
          name={recipe.name}
          setName={(name) => setRecipe({ ...recipe, name })}
          servings={recipe.servings}
          setServings={(servings) => setRecipe({ ...recipe, servings })}
          ingredients={recipe.ingredients}
          setIngredients={(ingredients) => setRecipe({ ...recipe, ingredients })}
          onPickIngredient={() => setPickingIngredient(true)}
          onCancel={() => setRecipe(null)}
          onSave={async (food) => {
            await saveFood(food, recipe.edit?.id);
            setRecipe(null);
            setTab('mine');
            flash('Recipe saved');
          }}
        />
      </Overlay>
    );
  }

  const forIngredient = pickingIngredient && recipe;

  return (
    <Overlay
      title={forIngredient ? 'Add ingredient' : 'Add food'}
      onBack={forIngredient ? () => setPickingIngredient(false) : onClose}
      right={
        <button className="link-btn" onClick={() => setScanning(true)}>
          Scan
        </button>
      }
    >
      <div className="search-bar">
        <input
          type="search"
          placeholder="Search foods"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={false}
        />
      </div>

      {query.trim() ? (
        <SearchResults query={query.trim()} onPick={setPicked} />
      ) : (
        <>
          <div className="tabs">
            <button className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>
              Recent
            </button>
            <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
              My foods
            </button>
            {!forIngredient && (
              <button className={tab === 'quick' ? 'on' : ''} onClick={() => setTab('quick')}>
                Quick add
              </button>
            )}
          </div>
          {tab === 'recent' && <RecentList onPick={setPicked} onScan={() => setScanning(true)} />}
          {tab === 'mine' && (
            <MyFoods
              onPick={setPicked}
              onNewFood={() => setCustom({})}
              onNewRecipe={() => setRecipe({ name: '', servings: 1, ingredients: [] })}
              onEdit={(f) => (f.source === 'recipe' ? setRecipe({ edit: f, name: f.name, servings: f.yield_servings ?? 1, ingredients: f.ingredients ?? [] }) : setCustom({ edit: f }))}
            />
          )}
          {tab === 'quick' && !forIngredient && (
            <QuickAdd
              onAdd={async (food) => {
                await logFood(date, food, 1, food.units[0]);
                flash(`Added ${Math.round(food.macros.kcal)} kcal`);
              }}
            />
          )}
        </>
      )}

      {lookup && <div className="toast">Looking up {lookup}…</div>}
      {toast && <div className="toast">{toast}</div>}

      {picked && (
        <AmountSheet
          food={picked.food}
          initialQty={picked.qty ?? 1}
          initialUnit={picked.unit}
          actionLabel={forIngredient ? 'Add to recipe' : 'Add'}
          saved={!!picked.food_id || savedIds.has(picked.food.source_id ?? '')}
          onSave={
            picked.food.source === 'usda' || picked.food.source === 'off'
              ? async () => {
                  const id = await saveFood(picked.food);
                  setSavedIds(new Set(savedIds).add(picked.food.source_id ?? ''));
                  setPicked({ ...picked, food_id: id });
                }
              : undefined
          }
          onClose={() => setPicked(null)}
          onSubmit={async (qty, unit) => {
            if (forIngredient) {
              setRecipe({ ...recipe, ingredients: [...recipe.ingredients, { food: stripFood(picked.food), qty, unit }] });
              setPicked(null);
              setPickingIngredient(false);
              return;
            }
            await logFood(date, stripFood(picked.food), qty, unit, picked.food_id);
            setPicked(null);
            setQuery('');
            flash(`Added ${picked.food.name}`);
          }}
        />
      )}
    </Overlay>
  );
}

/** Keep only the FoodData fields when copying a saved food into a log entry. */
function stripFood(f: FoodData): FoodData {
  const { name, brand, basis, macros, units, barcode, source, source_id } = f;
  return { name, brand, basis, macros, units, barcode, source, source_id };
}

function Overlay({
  title,
  onBack,
  right,
  children,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overlay">
      <div className="screen overlay-screen">
        <header className="header">
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <BackIcon size={26} />
          </button>
          <h1>{title}</h1>
          <div className="header-right">{right}</div>
        </header>
        {children}
      </div>
    </div>
  );
}

function RecentList({ onPick, onScan }: { onPick: (p: Picked) => void; onScan: () => void }) {
  const recents = useRecents();
  if (!recents) return null;
  if (recents.length === 0)
    return (
      <div className="empty-block">
        <p className="muted">Foods you log show up here, so the next time is one tap.</p>
        <button className="secondary" onClick={onScan}>
          Scan a barcode
        </button>
      </div>
    );
  return (
    <div className="food-list">
      {recents.map((r) => (
        <FoodRow key={r.key} food={r.food} qty={r.qty} unit={r.unit} onClick={() => onPick({ food: r.food, food_id: r.food_id, qty: r.qty, unit: r.unit })} />
      ))}
    </div>
  );
}

function MyFoods({
  onPick,
  onNewFood,
  onNewRecipe,
  onEdit,
}: {
  onPick: (p: Picked) => void;
  onNewFood: () => void;
  onNewRecipe: () => void;
  onEdit: (f: Food) => void;
}) {
  const foods = useSavedFoods();
  return (
    <div>
      <div className="row-btns pad-y">
        <button className="secondary" onClick={onNewFood}>
          + New food
        </button>
        <button className="secondary" onClick={onNewRecipe}>
          + New recipe or meal
        </button>
      </div>
      <div className="food-list">
        {foods?.map((f) => (
          <div key={f.id} className="food-row-wrap">
            <FoodRow food={f} sub={f.source === 'recipe' ? `recipe · ${f.units[0].label}` : undefined} onClick={() => onPick({ food: f, food_id: f.id })} />
            <div className="row-actions">
              {(f.source === 'custom' || f.source === 'recipe') && (
                <button className="link-btn small" onClick={() => onEdit(f)}>
                  Edit
                </button>
              )}
              <button className="link-btn small danger" onClick={() => confirm(`Remove ${f.name} from My foods?`) && deleteRecord('foods', f.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {foods && foods.length === 0 && <p className="muted pad">Foods you create, recipes, and foods you ☆ save appear here.</p>}
      </div>
    </div>
  );
}

function SearchResults({ query, onPick }: { query: string; onPick: (p: Picked) => void }) {
  const saved = useSavedFoods();
  const [online, setOnline] = useState<{ usda: FoodData[] | null; off: FoodData[] | null; errors: string[] }>({
    usda: null,
    off: null,
    errors: [],
  });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    setOnline({ usda: null, off: null, errors: [] });
    if (!navigator.onLine || query.length < 2) return;
    const t = setTimeout(() => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      searchUsda(query, c.signal)
        .then((usda) => setOnline((o) => ({ ...o, usda })))
        .catch((e) => !c.signal.aborted && setOnline((o) => ({ ...o, usda: [], errors: [...o.errors, String(e.message ?? e)] })));
      searchOff(query, c.signal)
        .then((off) => setOnline((o) => ({ ...o, off })))
        .catch(() => !c.signal.aborted && setOnline((o) => ({ ...o, off: [] })));
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.current?.abort();
    };
  }, [query]);

  const q = query.toLowerCase();
  const mine = (saved ?? []).filter((f) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(q));
  const loading = navigator.onLine && (online.usda == null || online.off == null);
  const remote = [...(online.usda ?? []), ...(online.off ?? [])];

  return (
    <div className="food-list">
      {mine.length > 0 && <h3 className="list-title">My foods</h3>}
      {mine.map((f) => (
        <FoodRow key={f.id} food={f} onClick={() => onPick({ food: f, food_id: f.id })} />
      ))}
      {!navigator.onLine && <p className="muted pad">You're offline. Only your own foods can be searched.</p>}
      {remote.length > 0 && <h3 className="list-title">Food database</h3>}
      {remote.map((f, i) => (
        <FoodRow key={(f.source_id ?? f.name) + i} food={f} sub={f.units[0].label} onClick={() => onPick({ food: f })} />
      ))}
      {loading && <p className="muted pad">Searching…</p>}
      {!loading && remote.length === 0 && mine.length === 0 && navigator.onLine && <p className="muted pad">No matches. Try fewer words.</p>}
      {online.errors.map((e) => (
        <p key={e} className="warn small pad">
          {e}
        </p>
      ))}
    </div>
  );
}
