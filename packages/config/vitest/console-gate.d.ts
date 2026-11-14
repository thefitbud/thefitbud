/** Types for ./console-gate.js (Z12-35, D-W12-28). */
export declare const ALLOWED: ReadonlyArray<{
  reason: string;
  owner: string;
  matches: (args: unknown[]) => boolean;
}>;
export declare function isAllowedConsoleError(args: unknown[]): boolean;
export declare function startConsoleGate(target?: Console): () => void;
