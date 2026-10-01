// Mirrors the --dur-* and --ease-* tokens in styles/tokens.css. Change both together.
// Motion takes seconds; CSS takes milliseconds.
export const dur = { micro: 0.12, short: 0.22, long: 0.42, print: 0.52 } as const;
export const ease = {
  out: [0.16, 1, 0.3, 1],
  in: [0.7, 0, 0.84, 0],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Signature moment timing: tags are punched one by one, then the recall receipt prints. */
export const punch = { stagger: 0.09, each: 0.18 } as const;
export const printDelay = (n: number) => 0.12 + Math.min(n, 5) * punch.stagger;
