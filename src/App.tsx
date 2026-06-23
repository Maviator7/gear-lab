import { useState } from 'react';
import type { ShiftPhase } from './types';
import GearboxScene from './components/GearboxScene';
import ExplanationPanel from './components/ExplanationPanel';
import ControlPanel from './components/ControlPanel';
import { TransmissionState, useTransmissionState } from './hooks/useTransmissionState';
import TutorialOverlay from './tutorial/TutorialOverlay';
import { MT_BASICS_TUTORIAL } from './tutorial/TutorialDefinition';

type AppMode = 'normal' | 'tutorial';

function phaseFromTransmissionState(tState: TransmissionState): ShiftPhase {
  switch (tState) {
    case TransmissionState.SYNCHRONIZING:
      return 'synchro';
    case TransmissionState.READY_TO_ENGAGE:
      return 'engage';
    default:
      return 'idle';
  }
}

export default function App() {
  const transmission = useTransmissionState();
  const shiftPhase = phaseFromTransmissionState(transmission.tState);
  const [appMode, setAppMode] = useState<AppMode>('normal');
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const tutorialActive = appMode === 'tutorial';
  const tutorialStep = MT_BASICS_TUTORIAL[tutorialStepIndex];

  const enterTutorial = () => {
    setAppMode('tutorial');
    setTutorialStepIndex(0);
  };

  const nextTutorialStep = () => {
    setTutorialStepIndex((index) => (index + 1) % MT_BASICS_TUTORIAL.length);
  };

  const prevTutorialStep = () => {
    setTutorialStepIndex((index) => Math.max(0, index - 1));
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* ヘッダ */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-slate-800 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-cyan-400 whitespace-nowrap">
            マニュアルトランスミッションの仕組み
          </h1>
          <p className="text-sm text-slate-400 truncate">
            クラッチ操作とシンクロ機構で、なぜ滑らかに変速できるかを体験しよう
          </p>
        </div>
        <div className="flex flex-shrink-0 overflow-hidden rounded-lg border border-slate-700">
          <button
            type="button"
            onClick={() => setAppMode('normal')}
            className={[
              'px-4 py-2 text-sm font-semibold transition',
              appMode === 'normal'
                ? 'bg-slate-100 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800',
            ].join(' ')}
          >
            通常モード
          </button>
          <button
            type="button"
            onClick={enterTutorial}
            className={[
              'px-4 py-2 text-sm font-semibold transition',
              appMode === 'tutorial'
                ? 'bg-cyan-400 text-slate-950'
                : 'bg-slate-900 text-cyan-200 hover:bg-slate-800',
            ].join(' ')}
          >
            チュートリアルモード
          </button>
        </div>
      </header>

      {/* 本体 */}
      <div className="flex flex-1 min-h-0">
        {/* 3D領域 */}
        <div className="relative flex-1 min-w-0">
          <TutorialOverlay
            active={tutorialActive}
            step={tutorialStep}
            stepIndex={tutorialStepIndex}
            totalSteps={MT_BASICS_TUTORIAL.length}
            onPrev={prevTutorialStep}
            onNext={nextTutorialStep}
          />
          <GearboxScene
            state={transmission.state}
            simRef={transmission.simRef}
            fxRef={transmission.fxRef}
            onEvent={transmission.handleSimEvent}
            tutorialHighlights={tutorialActive ? tutorialStep.highlights : []}
          />
        </div>

        {/* サイドバー */}
        <aside className="w-96 flex-shrink-0 flex flex-col border-l border-slate-800 overflow-y-auto bg-slate-900">
          <ExplanationPanel
            state={transmission.state}
            shiftPhase={shiftPhase}
            tState={transmission.tState}
            warning={transmission.warning}
            telemetry={transmission.telemetry}
          />
          <ControlPanel
            state={transmission.state}
            shiftPhase={shiftPhase}
            onGearSelect={transmission.requestShift}
            onClutchToggle={transmission.toggleClutch}
            onRpmChange={transmission.setRpm}
            onPlayToggle={transmission.togglePlay}
            onModeToggle={transmission.toggleMode}
          />
        </aside>
      </div>
    </div>
  );
}
