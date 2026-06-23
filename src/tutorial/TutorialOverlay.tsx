import type { TutorialStepDefinition } from './types';

interface Props {
  active: boolean;
  step: TutorialStepDefinition;
  stepIndex: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function TutorialOverlay({
  active,
  step,
  stepIndex,
  totalSteps,
  onPrev,
  onNext,
}: Props) {
  if (!active) return null;

  const progress = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div className="absolute left-4 top-4 z-20 w-[min(340px,calc(100%-32px))] rounded-lg border border-cyan-400/45 bg-slate-950/82 p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-semibold text-cyan-300">
          STEP {stepIndex + 1} / {totalSteps}
        </p>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <h2 className="text-base font-bold text-slate-50">{step.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">{step.instruction}</p>

      <div className="mt-4 border-t border-slate-700 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">なぜそうなるのか</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">{step.explanation}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={stepIndex === 0}
          className="rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
        >
          {stepIndex === totalSteps - 1 ? '最初へ' : '次へ'}
        </button>
      </div>
    </div>
  );
}
