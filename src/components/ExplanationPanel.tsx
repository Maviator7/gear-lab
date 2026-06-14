import type { GearboxState, ShiftPhase, Telemetry } from '../types';
import type { Warning } from '../hooks/useTransmissionState';
import { TransmissionState } from '../hooks/useTransmissionState';
import { GEARS } from '../data/gears';
import { EXPLANATIONS, getExplanationText, getPhaseLabel } from '../data/explanations';

interface Props {
  state: GearboxState;
  shiftPhase: ShiftPhase;
  tState: TransmissionState;
  warning: Warning | null;
  telemetry: Telemetry;
}

export default function ExplanationPanel({ state, shiftPhase, tState, warning, telemetry }: Props) {
  const { selectedGear, clutchEngaged, rpm, mode } = state;

  // ギアペアスペック（N の場合はnull）
  const spec = selectedGear !== 'N' ? GEARS.find((g) => g.id === selectedGear) : null;

  // 解説テキスト
  const explanationText = getExplanationText(selectedGear, mode, shiftPhase, clutchEngaged);

  // トルク・速度バー正規化
  // totalRatio 範囲: 0.78(5速) ~ 3.55(1速)
  const maxRatio = 3.55;
  const torqueBar = spec ? Math.min(spec.totalRatio / maxRatio, 1) : 0;
  const speedBar = spec ? Math.min((1 / spec.totalRatio) / (1 / 0.78), 1) : 0;

  // 歯数式（詳細モード）
  let toothFormula = '';
  if (spec) {
    if (spec.id === 'R') {
      // アイドラーを展開した式: (idler/counter)×(output/idler) = output/counter。
      // アイドラーの歯数は約分されて消える＝比率に影響しないことを式で見せる。
      toothFormula = `(29/21) × (${spec.idlerTeeth}/${spec.counterTeeth}) × (${spec.outputTeeth}/${spec.idlerTeeth})`;
    } else {
      toothFormula = `(29/21) × (${spec.outputTeeth}/${spec.counterTeeth})`;
    }
  }

  // 各軸RPM計算
  const engineRpm = rpm;
  const inputRpm = clutchEngaged ? rpm : 0;
  const counterRpm = inputRpm > 0 ? inputRpm * (21 / 29) : 0;
  let outputRpmDisplay: string;
  if (selectedGear === 'N') {
    outputRpmDisplay = '—';
  } else if (!clutchEngaged || inputRpm === 0) {
    outputRpmDisplay = '0';
  } else if (spec) {
    outputRpmDisplay = Math.round(rpm / spec.totalRatio).toString();
  } else {
    outputRpmDisplay = '—';
  }

  const isShifting = shiftPhase !== 'idle';
  const phaseLabel = getPhaseLabel(shiftPhase);
  const syncPercent = Math.round(telemetry.syncRate * 100);
  const stateLabel = getTransmissionStateLabel(tState);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ギア名とバッジ */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-cyan-400">
          {selectedGear === 'N' ? 'ニュートラル' : selectedGear === 'R' ? 'リバース' : `${selectedGear}速`}
        </h2>
        {spec && (
          <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-sm font-mono">
            ギア比 {spec.totalRatio.toFixed(2)} : 1
          </span>
        )}
        {selectedGear === 'R' && (
          <span className="px-2 py-0.5 rounded bg-amber-700 text-amber-200 text-sm font-bold">
            回転方向: 逆転
          </span>
        )}
      </div>


      {/* 変速状態 */}
      <div className="rounded-md bg-slate-800 px-3 py-2 border border-slate-700">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">変速状態</p>
          <span className="font-mono text-xs text-cyan-300">{stateLabel}</span>
        </div>
        {warning && (
          <div className="mt-2 rounded bg-red-950/70 border border-red-700 px-2 py-2 text-sm font-semibold text-red-200">
            {warning.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </div>

      {/* クラッチ切断警告 */}
      {!clutchEngaged && shiftPhase === 'idle' && (
        <div className="rounded-md bg-red-900/60 border border-red-700 px-3 py-2 text-red-300 text-sm">
          ⚠ 動力が切れています（クラッチ切断中）
        </div>
      )}

      {/* シフトフェーズ強調表示 */}
      {isShifting && (
        <div className="rounded-md bg-amber-900/60 border border-amber-600 px-3 py-2">
          <p className="text-amber-400 text-xs font-bold uppercase tracking-wide mb-1">
            {phaseLabel}
          </p>
          <p className="text-amber-200 text-sm">{EXPLANATIONS.phases[shiftPhase]}</p>
        </div>
      )}

      {/* 解説テキスト */}
      {!isShifting && (
        <p className="text-slate-300 text-sm leading-relaxed">{explanationText}</p>
      )}

      {/* トルク/速度バー（ギア選択時のみ） */}
      {spec && !isShifting && (
        <div className="flex flex-col gap-2 mt-1">
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>トルク（力）</span>
              <span>{Math.round(torqueBar * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${torqueBar * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>速度（出力）</span>
              <span>{Math.round(speedBar * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                style={{ width: `${speedBar * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 詳細モード: 歯数式と各軸RPM */}
      {mode === 'detail' && (
        <div className="mt-2 flex flex-col gap-3">
          {spec && (
            <div className="rounded-md bg-slate-800 px-3 py-2">
              <p className="text-xs text-slate-400 mb-1">歯数式（総減速比）</p>
              <p className="font-mono text-cyan-300 text-sm">
                {toothFormula} = {spec.totalRatio.toFixed(2)}
              </p>
            </div>
          )}


          <div className="rounded-md bg-slate-800 px-3 py-2">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-slate-400">シンクロ一致率</p>
              <span className={syncPercent >= 100 ? 'font-mono text-emerald-300' : 'font-mono text-cyan-300'}>
                {syncPercent}%
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-3">
              <div
                className={syncPercent >= 100 ? 'h-full bg-emerald-400 rounded-full transition-all duration-300' : 'h-full bg-cyan-400 rounded-full transition-all duration-300'}
                style={{ width: `${syncPercent}%` }}
              />
            </div>
            <table className="w-full text-sm">
              <tbody className="font-mono">
                <tr>
                  <td className="text-slate-400 py-0.5">現在ギア回転数</td>
                  <td className="text-right text-slate-200">{telemetry.currentRpm} rpm</td>
                </tr>
                <tr>
                  <td className="text-slate-400 py-0.5">出力軸回転数</td>
                  <td className="text-right text-slate-200">{telemetry.outputRpm} rpm</td>
                </tr>
                <tr>
                  <td className="text-slate-400 py-0.5">目標回転数</td>
                  <td className="text-right text-slate-200">
                    {telemetry.targetRpm === null ? <span className="text-slate-500">—</span> : `${telemetry.targetRpm} rpm`}
                  </td>
                </tr>
                <tr>
                  <td className="text-slate-400 py-0.5">回転差</td>
                  <td className={telemetry.diffRpm !== null && telemetry.diffRpm > 400 ? 'text-right text-red-300' : 'text-right text-emerald-300'}>
                    {telemetry.diffRpm === null ? <span className="text-slate-500">—</span> : `${telemetry.diffRpm} rpm`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-md bg-slate-800 px-3 py-2">
            <p className="text-xs text-slate-400 mb-2">各軸 RPM</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs">
                  <th className="text-left font-normal pb-1">軸</th>
                  <th className="text-right font-normal pb-1">RPM</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr>
                  <td className="text-slate-400 py-0.5">エンジン</td>
                  <td className="text-right text-slate-200">{engineRpm}</td>
                </tr>
                <tr>
                  <td className="text-slate-400 py-0.5">入力軸</td>
                  <td className="text-right text-slate-200">
                    {clutchEngaged ? inputRpm : <span className="text-red-400">0</span>}
                  </td>
                </tr>
                <tr>
                  <td className="text-slate-400 py-0.5">カウンター</td>
                  <td className="text-right text-slate-200">
                    {clutchEngaged ? Math.round(counterRpm) : <span className="text-red-400">0</span>}
                  </td>
                </tr>
                <tr>
                  <td className="text-slate-400 py-0.5">出力軸</td>
                  <td className="text-right text-slate-200">
                    {outputRpmDisplay === '—' ? (
                      <span className="text-slate-500">—</span>
                    ) : !clutchEngaged ? (
                      <span className="text-red-400">0</span>
                    ) : (
                      outputRpmDisplay
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


function getTransmissionStateLabel(tState: TransmissionState): string {
  switch (tState) {
    case TransmissionState.NEUTRAL:
      return 'NEUTRAL';
    case TransmissionState.CLUTCH_DISENGAGED:
      return 'CLUTCH_DISENGAGED';
    case TransmissionState.SYNCHRONIZING:
      return 'SYNCHRONIZING';
    case TransmissionState.READY_TO_ENGAGE:
      return 'READY_TO_ENGAGE';
    case TransmissionState.ENGAGED:
      return 'ENGAGED';
    case TransmissionState.SHIFT_FAILED:
      return 'SHIFT_FAILED';
  }
}
