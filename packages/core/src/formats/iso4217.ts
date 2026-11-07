// Written by `bun scripts/registries.ts` from the pinned release below: edit the script, not this file.
// ISO 4217 list one as SIX published it on 2026-09-17: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
// the distinct alphabetic codes

// lookup-table: the 178 alphabetic codes of the 2026-09-17 list, one line per first letter, read by isIso4217
const CODES: ReadonlySet<string> = /* @__PURE__ */ new Set(
	/* @__PURE__ */ `AED AFN ALL AMD AOA ARS AUD AWG AZN
BAM BBD BDT BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD
CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK
DJF DKK DOP DZD
EGP ERN ETB EUR
FJD FKP
GBP GEL GHS GIP GMD GNF GTQ GYD
HKD HNL HTG HUF
IDR ILS INR IQD IRR ISK
JMD JOD JPY
KES KGS KHR KMF KPW KRW KWD KYD KZT
LAK LBP LKR LRD LSL LYD
MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN
NAD NGN NIO NOK NPR NZD
OMR
PAB PEN PGK PHP PKR PLN PYG
QAR
RON RSD RUB RWF
SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL
THB TJS TMT TND TOP TRY TTD TWD TZS
UAH UGX USD USN UYI UYU UYW UZS
VED VES VND VUV
WST
XAD XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX
YER
ZAR ZMW ZWG`.split(/\s/u),
)

/**
 * Whether `value` is a current ISO 4217 alphabetic currency code, exactly as written: uppercase, such as EUR or USD.
 * The codes are those of the list published 2026-09-17, fund and precious metal codes such as XAU included;
 * a withdrawn code such as HRK is not one. Any string is taken; this never throws.
 */
export function isIso4217(value: string): boolean {
	return CODES.has(value)
}
