import type { Block, Program, ProgramDay, Slot } from './db';

const uid = () => crypto.randomUUID();

function slot(options: string[], sets: number, reps: [number, number], o: Partial<Slot> = {}): Slot {
  return { id: uid(), options, warmupSets: 0, sets, repsMin: reps[0], repsMax: reps[1], rir: 0, ...o };
}

function block(restSec: number, slots: Slot[], optional = false): Block {
  return { id: uid(), restSec, slots, optional };
}

function day(name: string, weekdays: number[], blocks: Block[]): ProgramDay {
  return { id: uid(), name, weekdays, blocks };
}

/**
 * Push / pull / legs, six days a week, two hard working sets per exercise.
 * Main work is about 40-50 minutes; the optional finisher at the end of each day
 * adds about 8-10 minutes of injury-prevention work.
 */
export function pplTemplate(): Omit<Program, 'updated_at' | 'deleted' | 'dirty'> {
  const push = day('Push', [1, 4], [
    block(180, [slot(['Incline dumbbell press', 'Incline Smith press'], 2, [6, 10], { warmupSets: 2 })]),
    block(150, [slot(['Machine chest press', 'Weighted dips'], 2, [8, 12], { warmupSets: 1 })]),
    block(150, [slot(['Seated dumbbell shoulder press', 'Machine shoulder press'], 2, [8, 12], { warmupSets: 1 })]),
    block(90, [
      slot(['Cable lateral raise', 'Dumbbell lateral raise'], 2, [10, 15]),
      slot(['Overhead cable triceps extension', 'Skull crusher'], 2, [10, 15]),
    ]),
    block(
      60,
      [
        slot(['Face pull'], 2, [15, 20], { rir: 2 }),
        slot(['Cable external rotation', 'Band external rotation'], 2, [12, 15], { rir: 2, notes: 'Each arm' }),
      ],
      true,
    ),
  ]);

  const pull = day('Pull', [2, 5], [
    block(150, [slot(['Lat pulldown', 'Weighted pull-up'], 2, [6, 10], { warmupSets: 2 })]),
    block(150, [slot(['Chest-supported row', 'Seal row'], 2, [6, 10], { warmupSets: 1 })]),
    block(90, [slot(['Reverse pec deck', 'Cable rear delt fly'], 2, [10, 15])]),
    block(90, [
      slot(['Incline dumbbell curl', 'Bayesian cable curl'], 2, [8, 12]),
      slot(['Hammer curl'], 2, [8, 12]),
    ]),
    block(
      60,
      [
        slot(['Back extension (45°)'], 2, [12, 15], { rir: 2, notes: 'Controlled, squeeze glutes at the top' }),
        slot(['Bird dog'], 2, [6, 8], { rir: null, notes: 'Per side, 8-10 s hold each rep' }),
      ],
      true,
    ),
  ]);

  const legs = day('Legs', [3, 6], [
    block(180, [slot(['Hack squat', 'Smith machine squat'], 2, [6, 10], { warmupSets: 2 })]),
    block(180, [slot(['Romanian deadlift', 'Stiff-leg dumbbell deadlift'], 2, [6, 10], { warmupSets: 1 })]),
    block(90, [slot(['Leg extension'], 2, [10, 15])]),
    block(90, [
      slot(['Lying leg curl', 'Seated leg curl'], 2, [8, 12]),
      slot(['Standing calf raise', 'Leg press calf raise'], 2, [8, 12]),
    ]),
    block(
      60,
      [
        slot(['McGill curl-up'], 2, [5, 8], { rir: null, notes: '8-10 s hold each rep' }),
        slot(['Side plank'], 2, [30, 45], { rir: null, notes: 'Seconds per side' }),
        slot(['Tibialis raise'], 2, [15, 20], { rir: 2 }),
      ],
      true,
    ),
  ]);

  return { id: uid(), name: 'Push / Pull / Legs 6x', schedule: 'weekly', active: 1, days: [push, pull, legs] };
}

export function blankProgram(): Omit<Program, 'updated_at' | 'deleted' | 'dirty'> {
  return {
    id: uid(),
    name: 'My program',
    schedule: 'weekly',
    active: 1,
    days: [day('Day 1', [1], [block(120, [slot([''], 2, [6, 10])])])],
  };
}

export function newSlot(): Slot {
  return slot([''], 2, [8, 12]);
}

export function newBlock(): Block {
  return block(120, [newSlot()]);
}

export function newDay(n: number): ProgramDay {
  return day(`Day ${n}`, [], [newBlock()]);
}
