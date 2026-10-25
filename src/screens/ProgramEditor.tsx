import { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { NumberField } from '../components/NumberField';
import { TrashIcon } from '../components/Icons';
import type { Block, Program, ProgramDay, Slot } from '../lib/db';
import { go } from '../lib/router';
import { newBlock, newDay, newSlot } from '../lib/templates';
import { saveProgram, useActiveProgram, useWorkouts } from '../lib/workoutData';

type Draft = Omit<Program, 'updated_at' | 'deleted' | 'dirty'>;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function move<T>(arr: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function ProgramEditor() {
  const program = useActiveProgram();
  const workouts = useWorkouts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    if (program && !draft) {
      const { updated_at: _u, deleted: _d, dirty: _x, ...rest } = program;
      setDraft(structuredClone(rest));
      setOpenDay(rest.days[0]?.id ?? null);
    }
  }, [program, draft]);

  // Exercise names you've used before, for autocomplete.
  const names = useMemo(() => {
    const set = new Set<string>();
    program?.days.forEach((d) => d.blocks.forEach((b) => b.slots.forEach((s) => s.options.forEach((o) => o && set.add(o)))));
    workouts?.forEach((w) => w.blocks.forEach((b) => b.exercises.forEach((e) => set.add(e.name))));
    return [...set].sort();
  }, [program, workouts]);

  useEffect(() => {
    if (program === null) go('workout');
  }, [program]);

  if (!draft) return <main className="screen" />;

  const edit = (fn: (d: Draft) => void) =>
    setDraft((cur) => {
      const next = structuredClone(cur!);
      fn(next);
      return next;
    });

  async function save() {
    await saveProgram(draft!);
    go('workout');
  }

  return (
    <main className="screen editor">
      <Header title="Program" back="workout" />
      <datalist id="exercise-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <section className="card">
        <label className="field">
          <span>Program name</span>
          <input value={draft.name} onChange={(e) => edit((d) => void (d.name = e.target.value))} />
        </label>
        <div className="segmented">
          <button className={draft.schedule === 'weekly' ? 'on' : ''} onClick={() => edit((d) => void (d.schedule = 'weekly'))}>
            Fixed weekdays
          </button>
          <button className={draft.schedule === 'rotation' ? 'on' : ''} onClick={() => edit((d) => void (d.schedule = 'rotation'))}>
            Rotation
          </button>
        </div>
        <p className="muted small hint">
          {draft.schedule === 'weekly'
            ? 'Each session runs on the weekdays you pick.'
            : 'Sessions run in order, A, B, C, then repeat, whatever the day.'}{' '}
          Alternate exercises rotate each time a session comes round.
        </p>
      </section>

      {draft.days.map((day, di) => (
        <DayEditor
          key={day.id}
          day={day}
          weekly={draft.schedule === 'weekly'}
          open={openDay === day.id}
          onToggle={() => setOpenDay(openDay === day.id ? null : day.id)}
          edit={(fn) => edit((d) => fn(d.days[di]))}
          onMove={(dir) => edit((d) => move(d.days, di, dir))}
          onDelete={() => confirm(`Delete ${day.name}?`) && edit((d) => void d.days.splice(di, 1))}
        />
      ))}

      <button
        className="secondary"
        onClick={() => {
          const day = newDay(draft.days.length + 1);
          edit((d) => void d.days.push(day));
          setOpenDay(day.id);
        }}
      >
        + Add session
      </button>

      <div className="sticky-save">
        <button className="primary" onClick={save}>
          Save program
        </button>
      </div>
    </main>
  );
}

function DayEditor({
  day,
  weekly,
  open,
  onToggle,
  edit,
  onMove,
  onDelete,
}: {
  day: ProgramDay;
  weekly: boolean;
  open: boolean;
  onToggle: () => void;
  edit: (fn: (d: ProgramDay) => void) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <section className="card day-card">
      <button className="day-head" onClick={onToggle}>
        <strong>{day.name || 'Untitled'}</strong>
        <span className="muted">
          {weekly && day.weekdays.length > 0 && `${[...day.weekdays].sort().map((w) => WEEKDAYS[w]).join(', ')} · `}
          {day.blocks.length} cards {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="day-body">
          <label className="field">
            <span>Session name</span>
            <input value={day.name} onChange={(e) => edit((d) => void (d.name = e.target.value))} />
          </label>
          {weekly && (
            <div className="chips weekdays">
              {WEEKDAYS.map((w, i) => (
                <button
                  key={w}
                  className={`chip ${day.weekdays.includes(i) ? 'on' : ''}`}
                  onClick={() =>
                    edit((d) => {
                      d.weekdays = d.weekdays.includes(i) ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i];
                    })
                  }
                >
                  {w}
                </button>
              ))}
            </div>
          )}

          {day.blocks.map((b, bi) => (
            <BlockEditor
              key={b.id}
              n={bi + 1}
              block={b}
              edit={(fn) => edit((d) => fn(d.blocks[bi]))}
              onMove={(dir) => edit((d) => move(d.blocks, bi, dir))}
              onDelete={() => edit((d) => void d.blocks.splice(bi, 1))}
            />
          ))}

          <button className="secondary" onClick={() => edit((d) => void d.blocks.push(newBlock()))}>
            + Add exercise card
          </button>
          <div className="row-btns spread">
            <button className="link-btn" onClick={() => onMove(-1)}>
              ↑ Move session up
            </button>
            <button className="link-btn" onClick={() => onMove(1)}>
              ↓ Down
            </button>
            <button className="link-btn danger" onClick={onDelete}>
              Delete session
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function BlockEditor({
  n,
  block,
  edit,
  onMove,
  onDelete,
}: {
  n: number;
  block: Block;
  edit: (fn: (b: Block) => void) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="block-editor">
      <div className="block-editor-head">
        <strong>
          Card {n}
          {block.slots.length > 1 ? ' · superset' : ''}
        </strong>
        <div className="row-btns">
          <button className="icon-btn small" onClick={() => onMove(-1)} aria-label="Move up">
            ↑
          </button>
          <button className="icon-btn small" onClick={() => onMove(1)} aria-label="Move down">
            ↓
          </button>
          <button className="icon-btn small" onClick={onDelete} aria-label="Delete card">
            <TrashIcon size={16} />
          </button>
        </div>
      </div>

      {block.slots.map((s, si) => (
        <SlotEditor
          key={s.id}
          slot={s}
          letter={block.slots.length > 1 ? String.fromCharCode(65 + si) : null}
          edit={(fn) => edit((b) => fn(b.slots[si]))}
          onDelete={block.slots.length > 1 ? () => edit((b) => void b.slots.splice(si, 1)) : undefined}
        />
      ))}

      <div className="block-opts">
        <label className="inline-field">
          <span>Rest (sec)</span>
          <NumberField label="Rest seconds" value={block.restSec} onChange={(v) => edit((b) => void (b.restSec = Math.max(0, Math.round(v ?? 0))))} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={!!block.optional} onChange={(e) => edit((b) => void (b.optional = e.target.checked))} />
          Optional (can skip)
        </label>
      </div>
      <button className="link-btn" onClick={() => edit((b) => void b.slots.push(newSlot()))}>
        + Superset another exercise
      </button>
    </div>
  );
}

function SlotEditor({
  slot,
  letter,
  edit,
  onDelete,
}: {
  slot: Slot;
  letter: string | null;
  edit: (fn: (s: Slot) => void) => void;
  onDelete?: () => void;
}) {
  const num = (k: 'warmupSets' | 'sets' | 'repsMin' | 'repsMax', label: string) => (
    <label className="mini-field">
      <span>{label}</span>
      <NumberField label={label} value={slot[k]} onChange={(v) => edit((s) => void (s[k] = Math.max(0, Math.round(v ?? 0))))} />
    </label>
  );
  return (
    <div className="slot-editor">
      {slot.options.map((o, oi) => (
        <div key={oi} className="option-row">
          <span className="ex-letter">{oi === 0 ? (letter ?? '•') : 'or'}</span>
          <input
            list="exercise-names"
            placeholder={oi === 0 ? 'Exercise' : 'Alternate exercise'}
            value={o}
            onChange={(e) => edit((s) => void (s.options[oi] = e.target.value))}
          />
          {slot.options.length > 1 && (
            <button className="icon-btn small" onClick={() => edit((s) => void s.options.splice(oi, 1))} aria-label="Remove">
              ×
            </button>
          )}
        </div>
      ))}
      <button className="link-btn small" onClick={() => edit((s) => void s.options.push(''))}>
        + Alternate (rotates each session)
      </button>
      <div className="mini-grid">
        {num('warmupSets', 'Warm-up')}
        {num('sets', 'Sets')}
        {num('repsMin', 'Reps min')}
        {num('repsMax', 'Reps max')}
        <label className="mini-field">
          <span>RIR</span>
          <NumberField label="RIR" value={slot.rir} placeholder="–" onChange={(v) => edit((s) => void (s.rir = v == null ? null : Math.round(v)))} />
        </label>
      </div>
      <input
        className="slot-notes"
        placeholder="Notes (optional), e.g. per side"
        value={slot.notes ?? ''}
        onChange={(e) => edit((s) => void (s.notes = e.target.value || undefined))}
      />
      {onDelete && (
        <button className="link-btn danger small" onClick={onDelete}>
          Remove from superset
        </button>
      )}
    </div>
  );
}
