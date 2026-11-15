/** `value`, or a throw naming `what` when it is undefined: a test's read of an entry it just made or checked */
export function defined<T>(value: T | undefined, what = "the value"): T {
  if (value === undefined) throw new Error(`${what} is undefined`);

  return value;
}
