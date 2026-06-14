import type { MutableRefObject } from 'react';

export type GearPosition = 'N' | '1' | '2' | '3' | '4' | '5' | 'R';
export type GearId = Exclude<GearPosition, 'N'>;
export type HubId = 'h12' | 'h34' | 'h5R';
export type ViewMode = 'beginner' | 'detail';
export type ShiftPhase = 'idle' | 'disengage' | 'synchro' | 'engage';

export interface GearPairSpec {
  id: GearId;
  label: string;          // 例 "1速"
  counterTeeth: number;   // カウンターシャフト側歯数
  outputTeeth: number;    // 出力軸側歯数
  idlerTeeth?: number;    // リバースのみ（アイドルギア）
  x: number;              // 軸方向位置
  hub: HubId;             // 担当シンクロハブ
  hubSide: -1 | 1;        // ハブから見てギアが -1=左(x小) / 1=右(x大)
  totalRatio: number;     // 常時噛合段含む総減速比（表示用、Rは正値で別途「逆転」表示）
}

export interface GearboxState {
  selectedGear: GearPosition;
  clutchEngaged: boolean;  // true = クラッチ接続（ペダルを踏んでいない）
  rpm: number;             // エンジン回転数 600–6000（初心者UIは3000上限）
  playing: boolean;
  mode: ViewMode;
}

/** 毎フレーム useGearboxAnimation が書き換える可変オブジェクト（参照は不変） */
export interface Sim {
  angles: {
    input: number; counter: number; output: number; idler: number;
    gears: Record<GearId, number>;     // 各出力側ギアの回転角（常時噛合なので常に回る）
  };
  speeds: { input: number; counter: number; output: number }; // 視覚 rad/s（符号付き）
  sleeves: Record<HubId, number>;      // スリーブ位置 -1..0..1（hubSide方向）
  synchroGlow: Record<HubId, number>;  // 0..1 シンクロ作動発光
  clutchGap: number;                   // 0=接続 .. 1=切断（ディスク間隙間）
  lockedGear: GearPosition;            // 実際にロック中のギア（シフト中はselectedと異なる）
  phase: ShiftPhase;
  powerFlow: boolean;                  // 出力軸まで動力が流れているか
  rpms: { engine: number; input: number; counter: number; output: number }; // 実RPM表示用
  // ── PHASE2 追加フィールド（既存は不変） ──────────────────────
  syncRate: number;                    // 0..1（シンクロ一致率。表示は%）
  targetGear: GearPosition;            // シフトシーケンスの目標（非シフト中は lockedGear と同値）
  // telemetry: sim が毎フレーム書く単一情報源。useTransmissionState が100msで読む
  telemetry: {
    currentRpm: number;                // 入力軸RPM（現在ギア回転数）
    outputRpm: number;                 // 出力軸RPM
    targetRpm: number | null;          // 目標入力軸RPM（同期に必要な値）。対象なしは null
    diffRpm: number | null;            // |current - target|
  };
}

export type SimRef = MutableRefObject<Sim>;

// ── PHASE2: React 表示用テレメトリ（useTransmissionState が sim から組み立てる） ──
// Sim 内部の telemetry フィールド + syncRate を合成した表示用スナップショット。
export interface Telemetry {
  currentRpm: number;        // 入力軸RPM（現在ギア回転数）
  outputRpm: number;         // 出力軸RPM
  targetRpm: number | null;  // 目標入力軸RPM（=同期に必要な値）。対象ギアなしは null
  diffRpm: number | null;    // |current - target|
  syncRate: number;          // 0..1（表示は%）
}
