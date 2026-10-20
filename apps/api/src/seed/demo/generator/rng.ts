/**
 * Deterministic PRNG for the demo seed (sfc32). One stream per
 * (persona, entity) key so editing one persona never shifts another's numbers.
 * Never use Math.random / Date.now in the generator.
 */
import { sha256HexSync } from "../ids.js";

export const DEMO_SEED_KEY = "fitbud-demo-world-v2";

export type Rng = {
  float(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  normal(mean: number, sd: number): number;
};

export function rngFor(...streamKey: string[]): Rng {
  const hex = sha256HexSync(`${DEMO_SEED_KEY}|${streamKey.join("|")}`);
  let a = parseInt(hex.slice(0, 8), 16) >>> 0;
  let b = parseInt(hex.slice(8, 16), 16) >>> 0;
  let c = parseInt(hex.slice(16, 24), 16) >>> 0;
  let d = parseInt(hex.slice(24, 32), 16) >>> 0;
  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i += 1) next();
  const rng: Rng = {
    float: next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    normal: (mean, sd) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return rng;
}
