import { lt, minVersion, subset, compare, intersects, Range, SemVer, Comparator } from 'semver';
import lodash from 'lodash';

/** A Range which is only allowed a single contiguous range of versions */
type SimpleRange = Range & {
  set: [readonly Comparator[]];
}

/** Returns a list of SimpleRange from a Range  */
function splitRange(range: Range): SimpleRange[] {
  return range.set.map((rules) => {
    const range = new Range('') as SimpleRange;
    range.set = [rules];
    return range;
  });
}

/** Returns a Range which combines all rules from a list of SimpleRange */
function combineRanges(ranges: SimpleRange[]): Range {
  const range = new Range('');
  range.set = ranges.map((range) => range.set[0]);
  return range;
}

/**
 * Attempt to merge two overlapping SimpleRanges
 * Returns undefined if the ranges are not overlapping
 * If either range is a superset of the other, returns it
 * Otherwise returns a new range spanning both
 */
function mergeSimpleRanges(a: SimpleRange, b: SimpleRange): SimpleRange | undefined {
  if (a.set.length !== 1) {
    throw new Error(`Range must only have one set of comparators, found: ${JSON.stringify(a.set)}`);
  }

  if (b.set.length !== 1) {
    throw new Error(`Range must only have one set of comparators, found: ${JSON.stringify(b.set)}`);
  }

  if (!intersects(a, b)) return undefined;
  if (subset(a, b)) return b;
  if (subset(b, a)) return a;

  const [first, last] = lt(getMinVersion(a) , getMinVersion(b)) ? [a, b] : [b, a];
  const range = new Range('') as SimpleRange;
  const lower = getLowerComparator(first);
  const upper = getUpperComparator(last);
  range.set = [[
    ...lower ? [lower] : [],
    ...upper ? [upper] : [],
  ]];
  return range;
}

/**
 * Attempt to find the intersection of two overlapping SimpleRanges
 * Returns undefined if the ranges are not overlapping
 * If either range is a subset of the other, returns it
 * Otherwise returns a new range spanning the intersection of both
 */
function intersectSimpleRanges(a: SimpleRange, b: SimpleRange): SimpleRange | undefined {
  if (a.set.length !== 1) {
    throw new Error(`Range must only have one set of comparators, found: ${JSON.stringify(a.set)}`);
  }

  if (b.set.length !== 1) {
    throw new Error(`Range must only have one set of comparators, found: ${JSON.stringify(b.set)}`);
  }

  if (!intersects(a, b)) return undefined;
  if (subset(a, b)) return a;
  if (subset(b, a)) return b;

  const [first, last] = lt(getMinVersion(a) , getMinVersion(b)) ? [a, b] : [b, a];
  const range = new Range('') as SimpleRange;
  // Since these ranges overlap, they must have an upper and lower comparator
  const lower = getLowerComparator(last) as Comparator;
  const upper = getUpperComparator(first) as Comparator;
  range.set = [[lower, upper]];
  return range;
}

/** Returns the lower comparator of a SimpleRange, if one exists */
function getLowerComparator(range: SimpleRange): Comparator | undefined {
  return range.set[0].find((comparator) => comparator.operator === '>=' || comparator.operator === '>');
}

/** Returns the upper comparator of a SimpleRange, if one exists */
function getUpperComparator(range: SimpleRange): Comparator | undefined {
  return range.set[0].find((comparator) => comparator.operator === '<=' || comparator.operator === '<');
}

/** Returns the minimum version for a Range, falling back to the first possible version */
function getMinVersion(range: Range) {
  return minVersion(range) || new SemVer('0.0.0-0');
}

/**
 * Returns a new version of a Range simplified to have no overlapping rules.
 * All rules are also ordered from lowest to highest.
*/
export function simplifyRange(range: Range): Range {
  const sortedRanges: Array<SimpleRange | undefined> = (
    splitRange(range)
    .map((range) => ({ range, minVersion: getMinVersion(range) }))
    .sort((a, b) => compare(a.minVersion, b.minVersion))
    .map((data) => data.range)
  );

  for (let i = 0; i + 1 < sortedRanges.length; i++) {
    const merged = mergeSimpleRanges(sortedRanges[i] as SimpleRange, sortedRanges[i + 1] as SimpleRange);
    if (merged) {
      sortedRanges[i] = undefined;
      sortedRanges[i + 1] = merged;
    }
  }
  return combineRanges(sortedRanges.filter((range): range is SimpleRange => Boolean(range)));
}

/** Returns a Range representing the intersection between two ranges */
export function intersectRanges(rangeA: Range, rangeB: Range): Range {
  const rangesA = splitRange(rangeA);
  const rangesB = splitRange(rangeB);
  const intersections: SimpleRange[] = [];

  for (const currentRangeA of rangesA) {
    for (const currentRangeB of rangesB) {
      const intersection = intersectSimpleRanges(currentRangeA, currentRangeB);
      if (intersection) intersections.push(intersection);
    }
  }

  return combineRanges(intersections);
}

/**
 * Returns a Range which represents the versions common to all versions in a list of Ranges.
 * (the intersection between them)
 */
export function getRangeListIntersection(ranges: Range[]): Range {
  if (ranges.length === 0) return new Range('');

  return ranges.map(simplifyRange).reduce((a, b) => intersectRanges(a, b));
}

/** Returns a list of unique Ranges from a list of range strings */
export function getUniqueRanges(rangeStrings: string[]) {
  return lodash.uniq(rangeStrings).map((range) => new Range(range));
}
