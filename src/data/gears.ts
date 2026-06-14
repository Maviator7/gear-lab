import type { GearId, GearPairSpec, HubId } from '../types';

export const MODULE = 0.08;
export const MAIN_Y = 1.0;     // 入力軸・出力軸（同軸）の y
export const COUNTER_Y = -1.0; // カウンターシャフトの y
// 常時噛合段（入力軸→カウンター）: 入力21T / カウンター29T, x = -3.4
export const CONSTANT_MESH = { inputTeeth: 21, counterTeeth: 29, x: -3.4 };
// リバースアイドルギア 18T。位置（幾何計算済み・変更禁止）:
// Rペアは歯数和42（半径和1.68 < 軸間2.0）であえて直接噛合しない隙間を作り、
// その隙間をアイドラーが橋渡しする。y/z はピッチ円が両ギアに接する位置。
export const IDLER = { teeth: 18, x: 4.7, y: -0.5616, z: 1.117 };

export const HUBS: Record<HubId, number> = { h12: -1.25, h34: 1.35, h5R: 4.0 };
export const SLEEVE_TRAVEL = 0.42;

// 視覚スロー再生係数: rpm → 視覚 rad/s（1/20スロー）
export const VISUAL_SCALE = (2 * Math.PI / 60) * 0.05;

export const GEARS: GearPairSpec[] = [
  {
    id: '1',
    label: '1速',
    counterTeeth: 14,
    outputTeeth: 36,
    x: -1.9,
    hub: 'h12',
    hubSide: -1,
    totalRatio: 3.55,
  },
  {
    id: '2',
    label: '2速',
    counterTeeth: 20,
    outputTeeth: 30,
    x: -0.6,
    hub: 'h12',
    hubSide: 1,
    totalRatio: 2.07,
  },
  {
    id: '3',
    label: '3速',
    counterTeeth: 25,
    outputTeeth: 25,
    x: 0.7,
    hub: 'h34',
    hubSide: -1,
    totalRatio: 1.38,
  },
  {
    id: '4',
    label: '4速',
    counterTeeth: 29,
    outputTeeth: 21,
    x: 2.0,
    hub: 'h34',
    hubSide: 1,
    totalRatio: 1.00,
  },
  {
    id: '5',
    label: '5速',
    counterTeeth: 32,
    outputTeeth: 18,
    x: 3.3,
    hub: 'h5R',
    hubSide: -1,
    totalRatio: 0.78,
  },
  {
    id: 'R',
    label: 'R（後退）',
    counterTeeth: 12,
    outputTeeth: 30,
    idlerTeeth: 18,
    x: 4.7,
    hub: 'h5R',
    hubSide: 1,
    totalRatio: 3.45, // (29/21) × (30/12) ≈ 3.45（アイドラーは比率に影響しない）
  },
];

export function getGearSpec(id: GearId): GearPairSpec {
  const spec = GEARS.find((g) => g.id === id);
  if (!spec) throw new Error(`Unknown gear id: ${id}`);
  return spec;
}
