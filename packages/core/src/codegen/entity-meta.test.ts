import { describe, expect, it } from "vitest";

import { parseField } from "./__fixtures__/runtime.ts";
import type { FieldMeta, TableMeta } from "./analyzer-types.ts";
import { deriveEntityMeta, isExcludedFromUpdate } from "./entity-meta.ts";

function table(columns: Record<string, string>, overrides: Partial<TableMeta> = {}): TableMeta {
  const fields: FieldMeta[] = Object.entries(columns).map(([key, raw]) => parseField(key, raw));

  return {
    checkConstraints: [],
    expressionIndexes: [],
    fields,
    hasCompositePrimaryKey: false,
    idPrefix: null,
    partialUniqueIndexes: [],
    schema: null,
    sqlName: "item",
    timestamps: {
      createdAt: false,
      deletedAt: false,
      names: { createdAt: null, deletedAt: null, updatedAt: null },
      style: "snake_case",
      updatedAt: false,
    },
    uniqueIndexes: [],
    varName: "item",
    ...overrides,
  };
}

describe("deriveEntityMeta: private columns", () => {
  it("publishes no private column in any list", () => {
    const meta = deriveEntityMeta(
      table(
        {
          _secret: 'c.text("_secret").notNull()',
          id: 'c.id("itm")',
          owner_id: 'c.ref("owner_id", { private: true }).references(() => owner.id)',
          slug: 'c.text("slug")',
          tenant_id: 'c.ref("tenant_id", { private: true }).references(() => tenant.id)',
        },
        {
          uniqueIndexes: [
            { columns: ["slug"], name: "item_slug" },
            { columns: ["owner_id", "slug"], name: "item_owner_slug" },
          ],
        },
      ),
    );

    expect(meta).toMatchObject({
      generated: ["id"],
      immutable: ["id"],
      tenantColumn: null,
      uniqueIndexes: [{ columns: ["slug"], name: "item_slug" }],
    });
  });
});

// C7 of the 0.14.1 review: a partial unique index is published with its predicate, a private name in neither
describe("deriveEntityMeta: partial unique indexes", () => {
  it("publishes each with its predicate, leaving out one over a private column or whose predicate names one", () => {
    const meta = deriveEntityMeta(
      table(
        {
          deleted_at: 'c.text("deleted_at")',
          hidden: 'c.text("hidden", { private: true })',
          id: 'c.id("itm")',
          slug: 'c.text("slug")',
        },
        {
          partialUniqueIndexes: [
            { columns: ["slug"], name: "item_slug_live", where: "deleted_at IS NULL" },
            { columns: ["hidden"], name: "item_hidden_live", where: "deleted_at IS NULL" },
            { columns: ["slug"], name: "item_slug_shown", where: '"hidden" = 0' },
            // hidden_at is no private column's name, though it starts with one
            { columns: ["slug"], name: "item_slug_dated", where: "hidden_at IS NULL" },
          ],
        },
      ),
    );

    expect(meta?.partialUniqueIndexes).toEqual([
      { columns: ["slug"], name: "item_slug_live", where: "deleted_at IS NULL" },
      { columns: ["slug"], name: "item_slug_dated", where: "hidden_at IS NULL" },
    ]);
  });
});

// C5 of r17: a private column's SQL name is found in a predicate as database quotes it, never read as a pattern
describe("deriveEntityMeta: a private column whose SQL name is regex syntax", () => {
  it("keeps an index whose predicate does not name it, and drops one that does", () => {
    const meta = deriveEntityMeta(
      table(
        {
          email: 'c.text("email")',
          id: 'c.id("itm")',
          paren: 'c.text("tok(en", { private: true })',
          plus: 'c.text("a+b", { private: true })',
        },
        {
          partialUniqueIndexes: [
            { columns: ["email"], name: "item_email_not_ab", where: "\"email\" <> 'ab'" },
            { columns: ["email"], name: "item_email_tok", where: '"tok(en" IS NULL' },
          ],
        },
      ),
    );

    expect(meta?.partialUniqueIndexes).toEqual([
      { columns: ["email"], name: "item_email_not_ab", where: "\"email\" <> 'ab'" },
    ]);
  });
});

describe("deriveEntityMeta: generated", () => {
  it.each([
    ["c.id(prefix)", 'c.id("itm")', ["id"]],
    ["c.serialId()", "c.serialId()", ["id"]],
    ["an auto-increment key", 'integer("id").primaryKey({ autoIncrement: true })', ["id"]],
    ["a key with a default", 'text("id").primaryKey().$defaultFn(() => crypto.randomUUID())', ["id"]],
    ["a natural key the caller supplies", 'c.text("id", { min: 2, max: 2 }).primaryKey()', []],
  ])("lists the primary key only when something other than the caller fills it: %s", (_name, raw, generated) => {
    expect(deriveEntityMeta(table({ id: raw }))?.generated).toEqual(generated);
  });

  it("adds the autogenerate columns", () => {
    expect(deriveEntityMeta(table({ created_at: 'c.createdAt("created_at")', id: 'c.id("itm")' }))?.generated).toEqual([
      "created_at",
      "id",
    ]);
  });
});

describe("deriveEntityMeta: identity", () => {
  it("is null for a composite or a missing primary key", () => {
    expect(deriveEntityMeta(table({ a: 'c.text("a")' }, { hasCompositePrimaryKey: true }))).toBeNull();
    expect(deriveEntityMeta(table({ a: 'c.text("a")' }))).toBeNull();
  });

  it("publishes the soft-delete column, the tenant column and the first declared machine", () => {
    const t = table(
      {
        deleted_at: 'c.deletedAt("deleted_at")',
        id: 'c.id("itm")',
        org_id: 'c.ref("org_id", { tenant: true }).notNull()',
        status: 'c.text("status")',
      },
      {
        timestamps: {
          createdAt: false,
          deletedAt: true,
          names: { createdAt: null, deletedAt: "deleted_at", updatedAt: null },
          style: "snake_case",
          updatedAt: false,
        },
      },
    );

    const status = t.fields.find((f) => f.name === "status") as FieldMeta;
    Object.assign(status, { enumValues: ["a", "b"], states: { initial: "a", terminal: null, transitions: null } });
    expect(deriveEntityMeta(t)).toMatchObject({
      identity: "id",
      name: "item",
      softDelete: "deleted_at",
      states: { column: "status", initial: "a", terminal: [], values: ["a", "b"] },
      tenantColumn: "org_id",
    });

    const camel = table(
      { deletedAt: 'c.deletedAt("deleted_at")', id: 'c.id("itm")' },
      {
        timestamps: {
          createdAt: false,
          deletedAt: true,
          names: { createdAt: null, deletedAt: "deletedAt", updatedAt: null },
          style: "camelCase",
          updatedAt: false,
        },
      },
    );

    expect(deriveEntityMeta(camel)?.softDelete).toBe("deletedAt");

    // a private tombstone is no published name (F10)
    const hidden = table(
      { deletedAt: 'c.deletedAt("deleted_at", { private: true })', id: 'c.id("itm")' },
      { timestamps: camel.timestamps },
    );

    expect(deriveEntityMeta(hidden)?.softDelete).toBeNull();
  });
});

describe("isExcludedFromUpdate", () => {
  it.each([
    ["id", 'c.id("itm")', true],
    // a reference is set once, at creation, unless it declares mutable (F25)
    ["owner_id", 'c.ref("owner_id").references(() => owner.id)', true],
    ["owner_id", 'c.ref("owner_id")', true],
    ["owner_id", 'c.text("owner_id").references(() => owner.id)', true],
    ["team_id", 'c.ref("team_id", { mutable: true }).references(() => team.id)', false],
    ["team_id", 'c.text("team_id", { mutable: true }).references(() => team.id)', false],
    ["slug", 'c.text("slug", { nomutate: true })', true],
    ["created_at", 'c.createdAt("created_at")', true],
    ["title", 'c.text("title")', false],
  ])("%s: %s → %s", (name, raw, expected) => {
    expect(isExcludedFromUpdate(parseField(name, raw))).toBe(expected);
  });
});

// F61: a column leaves update by what fills it or keys the row, never by its name
describe("isExcludedFromUpdate: a column named id that is no key", () => {
  it("is updatable, as any other column is, where the key is another column", () => {
    const partnerRef = parseField("id", 'c.text("partner_ref").notNull()');
    expect(partnerRef.isPrimaryKey).toBe(false);
    expect(isExcludedFromUpdate(partnerRef)).toBe(false);
    // a key named id still leaves update, as its key rule says
    expect(isExcludedFromUpdate(parseField("id", 'c.id("ptn")'))).toBe(true);
  });
});
