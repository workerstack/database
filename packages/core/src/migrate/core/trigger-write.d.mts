/** A write a table takes */
export type Event = "DELETE" | "INSERT" | "UPDATE"

export const EVENTS: readonly ["INSERT", "UPDATE", "DELETE"]
export function quote(name: string): string
export function triggerEvent(sql: string): Event
export function writeOf(table: string, event: Event, columns: readonly string[]): string
