import { ThinkingOrb } from "thinking-orbs";

// One decorative effect for every loading context; no provider/protocol stages.
export function AnalysisOrb() {
  return <span className="thinking-orb" aria-hidden="true" data-orb-state="searching">
    <ThinkingOrb state="searching" size={64} theme="light" speed={0.8} />
  </span>;
}
