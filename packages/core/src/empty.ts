/** Shared frozen empties, so a default argument allocates nothing. Internal: not exported from any entry point. */
export const EMPTY_OBJ: Readonly<Record<string, never>> = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ Object.create(null),
);

export const EMPTY_ARR: readonly never[] = /* @__PURE__ */ Object.freeze([]);
