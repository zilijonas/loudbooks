import en from '../locales/en.json'

type Messages = typeof en
type Group = keyof Messages
export type MessageKey = { [G in Group]: `${G}.${Extract<keyof Messages[G], string>}` }[Group]
export type Params = Record<string, string | number>

const PLURAL = /\{(\w+),\s*plural,((?:\s*(?:=\d+|\w+)\s*\{[^{}]*\})+)\s*\}/g
const CASE = /(=\d+|\w+)\s*\{([^{}]*)\}/g
const rules = new Intl.PluralRules('en')

/** Looks up a string and fills `{name}` and `{n, plural, one {# x} other {# xs}}`. Missing params stay as written. */
export function t(key: MessageKey, params: Params = {}): string {
  const [group, id] = key.split('.') as [Group, string]
  const raw = (en[group] as Record<string, string>)[id] ?? key
  return raw
    .replace(PLURAL, (_, name: string, cases: string) => {
      const n = Number(params[name])
      const table = Object.fromEntries([...cases.matchAll(CASE)].map((m) => [m[1], m[2]]))
      const body = table[`=${n}`] ?? table[rules.select(n)] ?? table.other ?? ''
      return body.replace(/#/g, String(n))
    })
    .replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}
