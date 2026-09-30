import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// These labels describe what the real pipeline actually does, in order —
// but real OCR/CV processing takes a variable amount of time (well under a
// second to over a minute depending on file size and quality), and the
// frontend has no live progress feed from the backend. So this loops
// continuously for as long as `active` is true rather than stepping through
// on a fixed timer and stalling on a label once the real work outlasts it —
// that would misrepresent which stage is actually running.
const PHASES = [
  "Preprocessing document...",
  "Reading document (OCR)...",
  "Classifying document type...",
  "Extracting information...",
  "Checking consistency...",
  "Assessing verification signals...",
];

export function AIProcessingIndicator({ active }: { active: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % PHASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-primary-light px-3 py-2.5 text-sm text-primary-dark">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        {PHASES[phase]}
      </div>
      <p className="pl-6 text-xs text-primary-dark/70">Real OCR and verification — this can take up to a minute.</p>
    </div>
  );
}
