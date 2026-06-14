// simInitial.ts — Sim の初期値生成（R3F非依存）。
//
// useGearboxAnimation 内の旧 makeInitialSim をここへ移設。
// useTransmissionState が createInitialSim() で生成して保持し、Scene へ渡す。
// フック側も同関数を import するため単一情報源になる。
import type { Sim, GearId } from '../types';
import { GEARS, IDLER } from '../data/gears';

// 初期角オフセット（噛み合い位相）: 出力側ギアに π/歯数 を加算した状態から開始。
// カウンター側とペアで歯が重ならないように見せる。
function initialGearAngles(): Record<GearId, number> {
  const out = {} as Record<GearId, number>;
  for (const g of GEARS) {
    out[g.id] = Math.PI / g.outputTeeth;
  }
  return out;
}

export function createInitialSim(): Sim {
  return {
    angles: {
      input: 0,
      counter: 0,
      output: 0,
      idler: Math.PI / IDLER.teeth,
      gears: initialGearAngles(),
    },
    speeds: { input: 0, counter: 0, output: 0 },
    sleeves: { h12: 0, h34: 0, h5R: 0 },
    synchroGlow: { h12: 0, h34: 0, h5R: 0 },
    clutchGap: 0,
    lockedGear: 'N',
    phase: 'idle',
    powerFlow: false,
    rpms: { engine: 0, input: 0, counter: 0, output: 0 },
    // ── PHASE2 追加フィールドの初期値 ──
    syncRate: 0,
    targetGear: 'N',
    telemetry: { currentRpm: 0, outputRpm: 0, targetRpm: null, diffRpm: null },
  };
}
