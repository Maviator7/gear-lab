import type { ShiftPhase } from './types';
import GearboxScene from './components/GearboxScene';
import ExplanationPanel from './components/ExplanationPanel';
import ControlPanel from './components/ControlPanel';
import { TransmissionState, useTransmissionState } from './hooks/useTransmissionState';

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

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* ヘッダ */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-slate-800 flex items-baseline gap-4">
        <h1 className="text-lg font-bold text-cyan-400 whitespace-nowrap">
          マニュアルトランスミッションの仕組み
        </h1>
        <p className="text-sm text-slate-400 truncate">
          クラッチ操作とシンクロ機構で、なぜ滑らかに変速できるかを体験しよう
        </p>
      </header>

      {/* 本体 */}
      <div className="flex flex-1 min-h-0">
        {/* 3D領域 */}
        <div className="flex-1 min-w-0">
          <GearboxScene
            state={transmission.state}
            simRef={transmission.simRef}
            fxRef={transmission.fxRef}
            onEvent={transmission.handleSimEvent}
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
