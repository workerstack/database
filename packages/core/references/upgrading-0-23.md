---
description: Upgrading to 0.23
order: 170
---

# Upgrading to 0.23

What changes for a project on 0.22.1. Before deploying it:

1. **Know what changed in the API.** A test holds these three lists to the exports themselves.

   New exports: `isBcp47`.

   Removed: none. **Fix:** none.

   Changed: none.

   `isBcp47(value)` answers whether a string is a well-formed BCP 47 language tag, RFC 5646 §2.1's Language-Tag, exactly as written: it reads the grammar a `format: "bcp47"` column checks, takes what the column takes before its trim, never trims or folds case (`" en"` is false), and never throws, as the registry predicates do ([Formats](#formats)). **Fix:** none.

2. **Expect `format: "bcp47"` to take private-use and grandfathered tags.** The format named RFC 5646 §2.1 but checked its `langtag` alone, so it refused a private-use tag such as `x-private` and the irregular grandfathered tags, `i-klingon`, `i-default`, `en-GB-oed`, `sgn-BE-FR` and the rest of RFC 5646's list, which are well-formed tags of the standard. It now checks the whole Language-Tag, each class case-insensitive, and its published `pattern` grows to match: a column, its generated DTO and `isBcp47` (step 1) take them, and still take every tag they took before. The regular grandfathered tags, such as `zh-min-nan` and `art-lojban`, were already taken as langtags. **Fix:** none, unless code behind a `bcp47` column assumes a tag starts with a language subtag: handle a tag starting `x-` or `i-` there, or narrow the column with a `pattern`; regenerate, so the published spec carries the new pattern.
