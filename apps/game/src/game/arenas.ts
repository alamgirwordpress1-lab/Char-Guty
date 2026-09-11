/** A table to play at: its pot is the entry every player pays in total, and the target score. */
export interface Arena {
  readonly pot: number;
  readonly name: string;
  readonly tint: number;
}

/** pot ∈ {100,200,300,400,500} - see CLAUDE.md. */
export const ARENAS: readonly Arena[] = [
  { pot: 100, name: "Village Courtyard", tint: 0x2e9a2b },
  { pot: 200, name: "Village Fair", tint: 0x1d78da },
  { pot: 300, name: "River Bank", tint: 0x8b5cf6 },
  { pot: 400, name: "Town Square", tint: 0xec7c12 },
  { pot: 500, name: "Zamindar Palace", tint: 0xe5484d },
];

/** Only pots that split evenly between the players can be played. */
export function arenasFor(playerCount: number): Arena[] {
  return ARENAS.filter((arena) => arena.pot % playerCount === 0);
}
