import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// Checkpoint 1: the starter generator produced [start, end] with start > end,
// which violates the precondition (the real function throws a RangeError).
// Build valid intervals by construction instead: pick a start and a
// non-negative length. A small range makes shared endpoints, overlaps, and
// gaps of exactly one common. Negatives and two-digit numbers are included so
// that sorting numerically differs from sorting as strings.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -20, max: 20 }), fc.nat(6))
  .map(([start, len]): Interval => [start, start + len]);
const intervalList = fc.array(interval, { maxLength: 12 });

// Input whose intervals neither overlap nor touch, built directly: walk left
// to right, leaving a gap of at least 1 between consecutive intervals.
// Returned in sorted order.
const disjointSortedList: fc.Arbitrary<Interval[]> = fc
  .tuple(
    fc.integer({ min: -20, max: 20 }),
    fc.array(fc.tuple(fc.integer({ min: 1, max: 4 }), fc.nat(4)), { maxLength: 10 }),
  )
  .map(([first, steps]) => {
    const out: Interval[] = [];
    let cursor = first;
    for (const [gap, len] of steps) {
      const start = cursor + gap;
      out.push([start, start + len]);
      cursor = start + len;
    }
    return out;
  });

// Obviously-correct reference: is point p covered by any interval?
const covers = (xs: readonly Interval[], p: number) => xs.some(([s, e]) => s <= p && p <= e);

const clone = (xs: readonly Interval[]): Interval[] => xs.map(([s, e]): Interval => [s, e]);

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. The output is well-formed, sorted by start, and
  // consecutive intervals neither overlap nor touch.
  it('output is sorted with strict gaps between consecutive intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const [s, e] of out) expect(s).toBeLessThanOrEqual(e);
        for (let i = 0; i + 1 < out.length; i++) {
          expect(out[i][1]).toBeLessThan(out[i + 1][0]);
        }
      }),
    );
  });

  // Pattern: differential. Input and output cover exactly the same points,
  // checked at every integer and every half-integer in range (half-integers
  // catch gaps like 2 < x < 3 between [1, 2] and [3, 4]).
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (let p = -22; p <= 30; p += 0.5) {
          expect(covers(out, p), `point ${p}`).toBe(covers(xs, p));
        }
      }),
    );
  });

  // Pattern: invariant. The input array and its intervals are not modified,
  // and the output shares no interval objects with the input.
  it('does not modify or alias the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const before = clone(xs);
        const out = mergeIntervals(xs);
        expect(xs).toEqual(before);
        for (const o of out) expect(xs.includes(o)).toBe(false);
      }),
    );
  });

  // Pattern: metamorphic. Reordering the input does not change the output.
  it('is independent of input order', () => {
    fc.assert(
      fc.property(
        intervalList.chain(xs =>
          fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })),
        ),
        ([xs, shuffled]) => {
          expect(mergeIntervals(shuffled)).toEqual(mergeIntervals(xs));
        },
      ),
    );
  });

  // Pattern: metamorphic. Duplicating the input does not change the output.
  it('is unaffected by duplicate intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        expect(mergeIntervals([...xs, ...clone(xs)])).toEqual(mergeIntervals(xs));
      }),
    );
  });

  // Pattern: algebraic. Merging is idempotent: merging a merged list is a no-op.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: conditional. If no two intervals overlap or touch, the output is
  // exactly the input in sorted order.
  it('leaves disjoint, non-touching intervals unchanged (up to sorting)', () => {
    fc.assert(
      fc.property(
        disjointSortedList.chain(sorted =>
          fc.tuple(
            fc.constant(sorted),
            fc.shuffledSubarray(sorted, { minLength: sorted.length, maxLength: sorted.length }),
          ),
        ),
        ([sorted, shuffled]) => {
          expect(mergeIntervals(shuffled)).toEqual(sorted);
        },
      ),
    );
  });

  // Pattern: conditional. Two intervals that touch at exactly one endpoint
  // merge into one.
  it('merges intervals that share an endpoint', () => {
    fc.assert(
      fc.property(fc.integer({ min: -20, max: 20 }), fc.nat(5), fc.nat(5), (a, l1, l2) => {
        const b = a + l1;
        expect(mergeIntervals([[a, b], [b, b + l2]])).toEqual([[a, b + l2]]);
      }),
    );
  });
});
