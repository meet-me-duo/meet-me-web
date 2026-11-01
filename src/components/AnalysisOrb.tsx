import { ThinkingOrb, type OrbState } from "thinking-orbs";

// These are existing UI contexts, not provider progress or a simulated timeline.
const states = { checking: "searching", clarification: "composing", analysis: "solving" } satisfies Record<string, OrbState>;

export function AnalysisOrb({ phase, size = 20 }: { phase: keyof typeof states; size?: 20 | 64 }) {
  return <span className="thinking-orb" aria-hidden="true" data-orb-state={states[phase]}>
    <ThinkingOrb state={states[phase]} size={size} theme="light" speed={0.8} />
  </span>;
}
