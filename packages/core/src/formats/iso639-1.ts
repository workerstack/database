// Written by `bun scripts/registries.ts` from the pinned release below: edit the script, not this file.
// Debian iso-codes v4.20.1: https://salsa.debian.org/iso-codes-team/iso-codes/-/raw/v4.20.1/data/iso_639-2.json
// the two-letter code of every ISO 639-2 language that has one, which is ISO 639-1

// lookup-table: the 183 two-letter language codes, one line per first letter, read by isIso639Alpha2
const CODES: ReadonlySet<string> = /* @__PURE__ */ new Set(
	/* @__PURE__ */ `aa ab ae af ak am an ar as av ay az
ba be bg bi bm bn bo br bs
ca ce ch co cr cs cu cv cy
da de dv dz
ee el en eo es et eu
fa ff fi fj fo fr fy
ga gd gl gn gu gv
ha he hi ho hr ht hu hy hz
ia id ie ig ii ik io is it iu
ja jv
ka kg ki kj kk kl km kn ko kr ks ku kv kw ky
la lb lg li ln lo lt lu lv
mg mh mi mk ml mn mr ms mt my
na nb nd ne ng nl nn no nr nv ny
oc oj om or os
pa pi pl ps pt
qu
rm rn ro ru rw
sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw
ta te tg th ti tk tl tn to tr ts tt tw ty
ug uk ur uz
ve vi vo
wa wo
xh
yi yo
za zh zu`.split(/\s/u),
)

/**
 * Whether `value` is an ISO 639-1 two-letter language code, exactly as written: lowercase, such as hr or en. The
 * codes are those of Debian iso-codes v4.20.1. Any string is taken; this never throws.
 */
export function isIso639Alpha2(value: string): boolean {
	return CODES.has(value)
}
