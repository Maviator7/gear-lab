// useGearboxAnimation: シミュレーション本体（状態機械）— PHASE2 改修版
//
// 可変オブジェクトパターン: ここで useFrame が毎フレーム sim.current を書き換え、
// 各3D子コンポーネントは自分の useFrame で sim.current を読んで直接 rotation 等を更新する。
// **useFrame内で setState しない**（React再レンダーは state props 変化時のみ）。
// React への離散通知は onEvent(TransmissionEvent) コールバックのみ（setStateはしない）。
// telemetry は sim が毎フレーム書く単一情報源で、useTransmissionState が100msでポーリングする。
//
// 符号規約（DESIGN.md・変更禁止）— 回転軸は +X、外歯車の噛合は反転:
//   counterΩ = -inputΩ × (21/29)
//   前進ギアi: gearΩ_i = -counterΩ × (counterTeeth_i / outputTeeth_i)   → 入力と同方向
//   リバース : idlerΩ  = -counterΩ × (12/18)
//             gearΩ_R = -idlerΩ  × (18/30)                              → 入力と逆方向
//
// シグネチャ変更(PHASE2): simRef を外部(useTransmissionState)から受け取り void を返す。
// createInitialSim は simInitial.ts へ移設済み。
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { GearboxState, SimRef, Sim, GearId, GearPosition, HubId } from '../types';
import type { TransmissionEvent } from './useTransmissionState';
import {
  GEARS,
  getGearSpec,
  CONSTANT_MESH,
  IDLER,
  VISUAL_SCALE,
} from '../data/gears';

// 常時噛合比（入力21T→カウンター29T）
const CM = CONSTANT_MESH.counterTeeth / CONSTANT_MESH.inputTeeth; // 29/21

// ── 初心者モード: PHASE1 互換シーケンス秒数 ───────────────────
const DUR = { disengage: 0.35, synchro: 0.7, engage: 0.35 } as const;
const REENGAGE_DUR = 0.4; // engage後の自動クラッチ再接続にかける時間

// ── 詳細モード: シフトシーケンス秒数（DESIGN-PHASE2） ──────────
const DUR_D = { moveOut: 0.35, press: 0.25, engage: 0.25 } as const;

// ── 詳細モード物理定数（検算済み・変更禁止） ──────────────────
const TAU_DRAG = 8.0;        // クラッチ切断中、入力軸がエンジンΩへ弱く引かれる（クラッチドラッグ）
const TAU_SYNC = 0.5;        // シンクロ押付中: 入力軸が同期目標Ωへ強く引かれる
const ENGAGE_DOG_DIFF = 30;  // 係合可能なドグ回転差 [rpm, ギア側実RPM]
const ENGAGE_SUSTAIN = 0.3;  // 上記を維持すべき秒数
const SYNC_WINDOW = 400;     // 一致率表示の正規化幅 [rpm]
const T_SYNC_MAX = 4.0;      // 同期タイムアウト → shiftFailed(syncTimeout)
const FAIL_RETRACT = 0.3;    // 失敗時スリーブ後退秒数

// 一次遅れ（指数減衰）: v を target へ τ で収束させる。dt依存の安定式。
function approach(v: number, target: number, tau: number, dt: number): number {
  return v + (target - v) * (1 - Math.exp(-dt / tau));
}

// 線形に value を target へ rate(=単位/秒)で寄せる
function moveToward(v: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return target;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ギア g の出力側ギアが、与えられた counterΩ から導出される視覚角速度を返す。
function gearOmegaFromCounter(g: { id: GearId; counterTeeth: number; outputTeeth: number }, counterOmega: number): number {
  if (g.id === 'R') {
    // R: idlerΩ = -counterΩ×(Zc/Zi), gearΩ_R = -idlerΩ×(Zi/Zo)
    const idlerOmega = -counterOmega * (g.counterTeeth / IDLER.teeth);
    return -idlerOmega * (IDLER.teeth / g.outputTeeth);
  }
  // 前進: gearΩ_i = -counterΩ×(Zc/Zo)
  return -counterOmega * (g.counterTeeth / g.outputTeeth);
}

// 目標ギアの dog が outputΩ に一致する inputΩ（matchΩ）。PHASE1の synchro 特例と同式。
function matchInputOmega(targetGear: GearId, outputOmega: number): number {
  const spec = getGearSpec(targetGear);
  let counterSync: number;
  if (targetGear === 'R') {
    // R: gearΩ_R = +counterΩ×(Zc/Zo)（アイドラー2回反転）を outputΩ に一致 → counterΩ = +outputΩ×(Zo/Zc)
    counterSync = outputOmega * (spec.outputTeeth / spec.counterTeeth);
  } else {
    // 前進: gearΩ = -counterΩ×(Zc/Zo) を outputΩ に一致 → counterΩ = -outputΩ×(Zo/Zc)
    counterSync = -outputOmega * (spec.outputTeeth / spec.counterTeeth);
  }
  // counterΩ = -inputΩ×(21/29) → inputΩ = -counterΩ×(29/21)
  return -counterSync * CM;
}

// 可変の作業変数（描画状態と分離）
interface Work {
  inputOmega: number; // 入力軸の視覚角速度 rad/s（符号付き）
  counterOmega: number;
  outputOmega: number;
  autoClutchClosed: boolean; // 初心者モードのシフト自動クラッチ（true=接続）。詳細モードは常にtrue。
  phaseTimer: number; // 現フェーズ経過秒
  reengageTimer: number; // 初心者: engage後の自動クラッチ再接続タイマー
  targetGear: GearPosition; // シフト先（lockedとは別）
  prevSelected: GearPosition; // selectedGear の前回値（変化検出用）
  // 詳細モード sync 用
  syncSustain: number; // dogDiff≤30 を連続維持している秒数
  syncElapsed: number; // sync フェーズ通算経過（タイムアウト判定）
  prevClutchEngaged: boolean; // sync 中のクラッチ接続検出用
  prevMode: GearboxState['mode']; // モード切替検出用
}

export function useGearboxAnimation(
  simRef: SimRef,
  state: GearboxState,
  onEvent?: (e: TransmissionEvent) => void,
): void {
  const workRef = useRef<Work>({
    inputOmega: 0,
    counterOmega: 0,
    outputOmega: 0,
    autoClutchClosed: true,
    phaseTimer: 0,
    reengageTimer: 0,
    targetGear: 'N',
    prevSelected: 'N',
    syncSustain: 0,
    syncElapsed: 0,
    prevClutchEngaged: true,
    prevMode: state.mode,
  });

  // state を ref に逃がして useFrame から最新を読む（依存配列なしで常に最新）
  const stateRef = useRef(state);
  stateRef.current = state;

  useFrame((_, rawDt) => {
    const sim = simRef.current;
    const w = workRef.current;
    const st = stateRef.current;

    // playing=false: シム全体を凍結（角度もフェーズも進めない。FXも凍結に従う）
    if (!st.playing) return;

    const dt = Math.min(rawDt, 0.05); // dtクランプ

    // ── モード切替時のシーケンスリセット（中途半端なシーケンスを残さない） ──
    if (st.mode !== w.prevMode) {
      w.prevMode = st.mode;
      sim.phase = 'idle';
      w.phaseTimer = 0;
      w.autoClutchClosed = true;
      w.syncSustain = 0;
      w.syncElapsed = 0;
      w.targetGear = sim.lockedGear;
      sim.targetGear = sim.lockedGear;
    }

    if (st.mode === 'detail') {
      tickDetail(sim, w, st, dt, onEvent);
    } else {
      tickBeginner(sim, w, st, dt, onEvent);
    }
  });
}

// ════════════════════════════════════════════════════════════
// 初心者モード — PHASE1 と完全等価の挙動（自動クラッチ、必ず成功）
//   静的確認: 下記コードパスは PHASE1 useGearboxAnimation の速度モデル・シーケンスと
//   一字一句同じ物理（disengage 0.35s / synchro 0.7s / engage 0.35s、
//   synchro中 τ=0.2 強制収束、クラッチ切断 input→0 τ=1.5、output N減衰 τ=6、
//   自動クラッチ再接続 0.4s）。唯一の差分は React への通知が onPhaseChange ではなく
//   TransmissionEvent(synchroStart/syncReady/engaged) になった点のみ。
// ════════════════════════════════════════════════════════════
function tickBeginner(
  sim: Sim,
  w: Work,
  st: GearboxState,
  dt: number,
  onEvent?: (e: TransmissionEvent) => void,
): void {
  // ── シフト開始/中断検知（selectedGear変化で disengage からやり直し） ──
  if (st.selectedGear !== w.prevSelected) {
    w.prevSelected = st.selectedGear;
    if (st.selectedGear !== sim.lockedGear) {
      w.targetGear = st.selectedGear;
      sim.targetGear = st.selectedGear;
      sim.phase = 'disengage';
      w.phaseTimer = 0;
    } else if (sim.phase !== 'idle') {
      // 既にロック中のギアへ戻された → 目標を現ロックに合わせる（安全側）
      w.targetGear = sim.lockedGear;
      sim.targetGear = sim.lockedGear;
    }
  }

  // ── シフト状態機械 ─────────────────────────────────────
  if (sim.phase !== 'idle') {
    w.phaseTimer += dt;

    // 非アクティブハブの sleeve / glow を常に0へ戻す（放棄ハブの取り残し防止）
    const activeHub: HubId | null =
      w.targetGear !== 'N' && sim.phase !== 'disengage' ? getGearSpec(w.targetGear).hub : null;
    for (const h of Object.keys(sim.synchroGlow) as HubId[]) {
      if (h !== activeHub) {
        sim.synchroGlow[h] = approach(sim.synchroGlow[h], 0, 0.12, dt);
        sim.sleeves[h] = moveToward(sim.sleeves[h], 0, 1 / DUR.disengage, dt);
      }
    }

    if (sim.phase === 'disengage') {
      // 自動クラッチ切断（disengage開始時の TransmissionEvent 発火は不要）
      w.autoClutchClosed = false;
      if (w.phaseTimer >= DUR.disengage) {
        sim.lockedGear = 'N';
        sim.phase = 'synchro';
        w.phaseTimer = 0;
        // synchro 開始 → synchroStart 発火（目標がギアのときのみ）
        if (w.targetGear !== 'N') onEvent?.({ type: 'synchroStart', gear: w.targetGear as GearId });
      }
    } else if (sim.phase === 'synchro') {
      if (w.targetGear === 'N') {
        sim.phase = 'engage';
        w.phaseTimer = 0;
        onEvent?.({ type: 'syncReady' });
      } else {
        const spec = getGearSpec(w.targetGear);
        const target06 = spec.hubSide * 0.6;
        sim.sleeves[spec.hub] = moveToward(sim.sleeves[spec.hub], target06, 0.6 / DUR.synchro, dt);
        sim.synchroGlow[spec.hub] = approach(sim.synchroGlow[spec.hub], 1, 0.15, dt);
        if (w.phaseTimer >= DUR.synchro) {
          sim.phase = 'engage';
          w.phaseTimer = 0;
          // engage 開始 → syncReady 発火
          onEvent?.({ type: 'syncReady' });
        }
      }
    } else if (sim.phase === 'engage') {
      if (w.targetGear === 'N') {
        for (const h of Object.keys(sim.sleeves) as HubId[]) {
          sim.sleeves[h] = moveToward(sim.sleeves[h], 0, 1 / DUR.engage, dt);
        }
        if (w.phaseTimer >= DUR.engage) {
          sim.lockedGear = 'N';
          sim.phase = 'idle';
          w.phaseTimer = 0;
          w.reengageTimer = 0;
          onEvent?.({ type: 'engaged', gear: 'N' });
        }
      } else {
        const spec = getGearSpec(w.targetGear);
        sim.sleeves[spec.hub] = moveToward(sim.sleeves[spec.hub], spec.hubSide, 0.4 / DUR.engage, dt);
        sim.synchroGlow[spec.hub] = approach(sim.synchroGlow[spec.hub], 0, 0.12, dt);
        if (w.phaseTimer >= DUR.engage) {
          sim.lockedGear = w.targetGear;
          sim.phase = 'idle';
          w.phaseTimer = 0;
          w.reengageTimer = 0;
          onEvent?.({ type: 'engaged', gear: w.targetGear });
        }
      }
    }
  } else {
    // idle: 自動クラッチ再接続（engage直後 REENGAGE_DUR かけて閉じる）
    if (!w.autoClutchClosed) {
      w.reengageTimer += dt;
      if (w.reengageTimer >= REENGAGE_DUR) {
        w.autoClutchClosed = true;
      }
    }
    for (const h of Object.keys(sim.synchroGlow) as HubId[]) {
      sim.synchroGlow[h] = approach(sim.synchroGlow[h], 0, 0.1, dt);
    }
  }

  // ── 速度モデル（PHASE1どおり） ────────────────────────────
  const targetEngine = st.rpm * VISUAL_SCALE;
  const effectiveClutch = st.clutchEngaged && w.autoClutchClosed;

  const gapTarget = effectiveClutch ? 0 : 1;
  sim.clutchGap = moveToward(sim.clutchGap, gapTarget, 1 / 0.4, dt);

  let inputTau: number;
  let inputTargetOmega: number;
  if (sim.phase === 'synchro' && w.targetGear !== 'N') {
    // synchroフェーズ中の特例: inputΩ を matchΩ へ τ=0.2 で強制収束
    inputTargetOmega = matchInputOmega(w.targetGear as GearId, w.outputOmega);
    inputTau = 0.2;
  } else {
    inputTargetOmega = effectiveClutch ? targetEngine : 0;
    inputTau = effectiveClutch ? 0.25 : 1.5;
  }
  w.inputOmega = approach(w.inputOmega, inputTargetOmega, inputTau, dt);

  finishFrame(sim, w, st, dt);
}

// ════════════════════════════════════════════════════════════
// 詳細モード — 手動MT。自動クラッチなし。
//   ダウンシフト失敗→成功の定数根拠（DESIGN-PHASE2 §教育的成立性・検算済み）:
//     クラッチ切断中の入力軸は平衡で
//       inputΩ_eq ≈ (matchΩ/TAU_SYNC + engineΩ/TAU_DRAG)/(1/TAU_SYNC + 1/TAU_DRAG)
//     → 平衡 dogDiff ≈ |engineΩ − matchΩ| × (TAU_SYNC/(TAU_SYNC+TAU_DRAG)) × k_gear
//       = |engine − match| × (0.5/8.5) × k_gear ≈ |engine − match| × 0.0588 × k_gear
//     3→2ダウンシフト: エンジン1200のままなら eq diff≈17<30 で成功 /
//                       600 に下げると eq diff≈34>30 でタイムアウト失敗 → ブリッピングを学ぶ。
//   （sync中 dogDiff≤30 が 0.3s 連続で syncReady。4s 到達でタイムアウト失敗。）
// ════════════════════════════════════════════════════════════
function tickDetail(
  sim: Sim,
  w: Work,
  st: GearboxState,
  dt: number,
  onEvent?: (e: TransmissionEvent) => void,
): void {
  // 詳細モードに自動クラッチは存在しない（autoClutchClosed は常にtrue扱い）
  w.autoClutchClosed = true;
  // クラッチはユーザー操作のみ。effectiveClutch = state.clutchEngaged
  const effectiveClutch = st.clutchEngaged;

  // ── シフト開始/中断検知（検証は useTransmissionState 済み。simに届いた変化は受理） ──
  if (st.selectedGear !== w.prevSelected) {
    const prev = w.prevSelected;
    w.prevSelected = st.selectedGear;
    if (st.selectedGear !== sim.lockedGear) {
      // 新目標へシフト開始 → moveOut からやり直し
      w.targetGear = st.selectedGear;
      sim.targetGear = st.selectedGear;
      sim.phase = 'disengage'; // = moveOut フェーズ（内部メカフェーズ名は ShiftPhase を流用）
      w.phaseTimer = 0;
      w.syncSustain = 0;
      w.syncElapsed = 0;
    } else if (st.selectedGear === 'N' && sim.lockedGear === 'N' && sim.phase === 'idle') {
      // 失敗後の N 戻し等で「selectedGear=N に変わったがメカ既にニュートラル」→ 無駄な
      // シーケンスを回さないようガード（何もしない）。
      void prev;
    } else if (sim.phase !== 'idle') {
      w.targetGear = sim.lockedGear;
      sim.targetGear = sim.lockedGear;
    }
  }

  // ── フェーズタイマー前進 + スリーブ/glow アニメ（dogDiffに依存しない部分） ──
  // 注意: press→sync の係合判定は inputΩ を「今フレーム」更新した後に行う必要があるため、
  //       速度モデルの後段で評価する（フレーム遅れを避ける）。ここでは時間進行と
  //       moveOut/press の幾何アニメ・フェーズ遷移（synchro到達まで）だけを行う。
  if (sim.phase !== 'idle') {
    w.phaseTimer += dt;

    // 非アクティブハブの sleeve / glow を0へ戻す
    const activeHub: HubId | null =
      w.targetGear !== 'N' && sim.phase !== 'disengage' ? getGearSpec(w.targetGear).hub : null;
    for (const h of Object.keys(sim.synchroGlow) as HubId[]) {
      if (h !== activeHub) {
        sim.synchroGlow[h] = approach(sim.synchroGlow[h], 0, 0.12, dt);
        sim.sleeves[h] = moveToward(sim.sleeves[h], 0, 1 / DUR_D.moveOut, dt);
      }
    }

    if (sim.phase === 'disengage') {
      // moveOut(0.35s): 全スリーブ→0、lockedGear='N'
      if (w.phaseTimer >= DUR_D.moveOut) {
        sim.lockedGear = 'N';
        if (w.targetGear === 'N') {
          // 目標'N'ならここで engaged('N') を発火して終了（press/sync をスキップ）
          sim.phase = 'idle';
          w.phaseTimer = 0;
          sim.syncRate = 0;
          onEvent?.({ type: 'engaged', gear: 'N' });
        } else {
          sim.phase = 'synchro'; // = press→sync（synchro 内で時間分岐）
          w.phaseTimer = 0;
          w.syncSustain = 0;
          w.syncElapsed = 0;
          // press 開始 = synchroStart 発火
          onEvent?.({ type: 'synchroStart', gear: w.targetGear as GearId });
        }
      }
    } else if (sim.phase === 'synchro') {
      // press(0.25s): スリーブを hubSide×0.6 へ、glow→1（係合判定は速度更新後）
      const spec = getGearSpec(w.targetGear as GearId);
      const target06 = spec.hubSide * 0.6;
      sim.sleeves[spec.hub] = moveToward(sim.sleeves[spec.hub], target06, 0.6 / DUR_D.press, dt);
      sim.synchroGlow[spec.hub] = approach(sim.synchroGlow[spec.hub], 1, 0.15, dt);
    } else if (sim.phase === 'engage') {
      // engage(0.25s): スリーブ→hubSide×1.0、lockedGear=目標、engaged発火
      const spec = getGearSpec(w.targetGear as GearId);
      sim.sleeves[spec.hub] = moveToward(sim.sleeves[spec.hub], spec.hubSide, 0.4 / DUR_D.engage, dt);
      sim.synchroGlow[spec.hub] = approach(sim.synchroGlow[spec.hub], 0, 0.12, dt);
      if (w.phaseTimer >= DUR_D.engage) {
        sim.lockedGear = w.targetGear;
        sim.phase = 'idle';
        w.phaseTimer = 0;
        sim.syncRate = 1;
        onEvent?.({ type: 'engaged', gear: w.targetGear });
      }
    }
  } else {
    // idle: glow / 残留スリーブを確実に0へ（失敗後のスリーブ後退もここで FAIL_RETRACT 速度で完了）
    for (const h of Object.keys(sim.synchroGlow) as HubId[]) {
      sim.synchroGlow[h] = approach(sim.synchroGlow[h], 0, 0.1, dt);
      if (sim.lockedGear === 'N') {
        sim.sleeves[h] = moveToward(sim.sleeves[h], 0, 0.6 / FAIL_RETRACT, dt);
      }
    }
  }

  // ── 速度モデル（詳細モード・運動学の主従） ────────────────
  const targetEngine = st.rpm * VISUAL_SCALE;

  const gapTarget = effectiveClutch ? 0 : 1;
  sim.clutchGap = moveToward(sim.clutchGap, gapTarget, 1 / 0.4, dt);

  if (effectiveClutch) {
    // クラッチ接続時: inputΩ → engineΩ (τ=0.25)。※PHASE1と同じ
    w.inputOmega = approach(w.inputOmega, targetEngine, 0.25, dt);
    // 出力軸: ロック中はギア速度（=動力伝達）。N は τ=6 減衰。
    if (sim.lockedGear !== 'N') {
      w.counterOmega = -w.inputOmega * (CONSTANT_MESH.inputTeeth / CONSTANT_MESH.counterTeeth);
      const spec = getGearSpec(sim.lockedGear as GearId);
      w.outputOmega = gearOmegaFromCounter(spec, w.counterOmega);
    } else {
      w.outputOmega = approach(w.outputOmega, 0, 6, dt);
    }
  } else {
    // クラッチ切断時 — 主従切替:
    if (sim.lockedGear !== 'N') {
      // lockedGear ≠ 'N'（ギアが入ったままクラッチ切断）: 出力軸が主。
      // outputΩ は車体慣性として τ=6 で緩減衰、inputΩ はギア比から逆算（ドラッグ則は適用しない）。
      // → 惰性走行が見える（車体慣性 ≫ クラッチドラッグ）。
      w.outputOmega = approach(w.outputOmega, 0, 6, dt);
      // inputΩ = lockedギアが outputΩ を生むのに必要な値（matchΩ）= 逆算従属値
      w.inputOmega = matchInputOmega(sim.lockedGear as GearId, w.outputOmega);
    } else {
      // lockedGear === 'N': 入力側が自由。ドラッグ＋シンクロ二重引き込み。
      const engineOmega = targetEngine;
      // ドラッグ: dω = (engineΩ − ω)/TAU_DRAG · dt（常時）
      let dOmega = (engineOmega - w.inputOmega) / TAU_DRAG;
      // シンクロ押付中（press完了後の sync 区間）: matchΩ への引き込みを加算（二重引き込み）
      const inSyncPress = sim.phase === 'synchro' && w.targetGear !== 'N' && w.phaseTimer >= DUR_D.press;
      if (inSyncPress) {
        const matchO = matchInputOmega(w.targetGear as GearId, w.outputOmega);
        dOmega += (matchO - w.inputOmega) / TAU_SYNC;
      }
      w.inputOmega += dOmega * dt;
      // outputΩ は N なので τ=6 減衰
      w.outputOmega = approach(w.outputOmega, 0, 6, dt);
    }
  }

  // ── sync 係合判定（inputΩ を今フレーム更新した後に評価。フレーム遅れなし） ──
  // press 完了後の sync 区間でのみ実施。dogDiff は更新後 inputΩ から導出。
  if (sim.phase === 'synchro' && w.targetGear !== 'N' && w.phaseTimer >= DUR_D.press) {
    w.syncElapsed += dt;
    if (effectiveClutch) {
      // クラッチ接続された → clutchDuringSync 失敗
      failSequence(sim, w, 'clutchDuringSync', onEvent);
    } else {
      const dogDiff = computeDogDiff(w, w.targetGear);
      // dogDiff≤30 が ENGAGE_SUSTAIN 連続 → syncReady
      if (dogDiff <= ENGAGE_DOG_DIFF) w.syncSustain += dt;
      else w.syncSustain = 0;
      if (w.syncSustain >= ENGAGE_SUSTAIN) {
        sim.phase = 'engage';
        w.phaseTimer = 0;
        onEvent?.({ type: 'syncReady' });
      } else if (w.syncElapsed >= T_SYNC_MAX) {
        // タイムアウト → syncTimeout 失敗
        failSequence(sim, w, 'syncTimeout', onEvent);
      }
    }
  }

  finishFrame(sim, w, st, dt);
}

// ── 失敗処理（共通）: スリーブ後退・glow減衰・イベント発火・シーケンス終了 ──
//   FAIL_RETRACT(0.3s) はスリーブの戻し速度に反映（moveToward rate = 0.6/FAIL_RETRACT）。
//   idle へ戻し、以降 finishFrame の glow 減衰で発光が消える。selectedGear='N' 戻しは
//   useTransmissionState 側（sim は lockedGear='N' のまま据え置き）。
function failSequence(
  sim: Sim,
  w: Work,
  reason: 'syncTimeout' | 'clutchDuringSync',
  onEvent?: (e: TransmissionEvent) => void,
): void {
  if (w.targetGear !== 'N') {
    const spec = getGearSpec(w.targetGear as GearId);
    // 失敗時はスリーブを即座に後退（FAIL_RETRACT を戻し速度へ反映）。
    sim.sleeves[spec.hub] = moveToward(sim.sleeves[spec.hub], 0, 0.6 / FAIL_RETRACT, 0.05);
  }
  sim.lockedGear = 'N';
  sim.targetGear = 'N';
  w.targetGear = 'N';
  sim.phase = 'idle';
  w.phaseTimer = 0;
  w.syncSustain = 0;
  w.syncElapsed = 0;
  sim.syncRate = 0;
  onEvent?.({ type: 'shiftFailed', reason });
}

// dogDiff = |gearRpm_target − outputRpm|（両方とも主軸上の実RPM。gearRpm は常時噛合から導出）
// counterΩ は現フレームの inputΩ から直接導出し、フレーム遅れ依存を避ける。
function computeDogDiff(w: Work, gear: GearPosition): number {
  if (gear === 'N') return 0;
  const spec = getGearSpec(gear as GearId);
  const counterOmega = -w.inputOmega * (CONSTANT_MESH.inputTeeth / CONSTANT_MESH.counterTeeth);
  const gearOmega = gearOmegaFromCounter(spec, counterOmega);
  const gearRpm = gearOmega / VISUAL_SCALE;
  const outputRpm = w.outputOmega / VISUAL_SCALE;
  return Math.abs(gearRpm - outputRpm);
}

// ── フレーム末処理（両モード共通）: counter/各ギア角速度・角度積分・公開値・telemetry ──
function finishFrame(sim: Sim, w: Work, st: GearboxState, dt: number): void {
  // 常時噛合の不変条件: counterΩ = -inputΩ × (21/29)
  w.counterOmega = -w.inputOmega * (CONSTANT_MESH.inputTeeth / CONSTANT_MESH.counterTeeth);

  // 出力側各ギア角速度（常時噛合・ロックの有無に関わらず常に積分）
  const gearOmega = {} as Record<GearId, number>;
  let idlerOmega = 0;
  for (const g of GEARS) {
    if (g.id === 'R') {
      idlerOmega = -w.counterOmega * (g.counterTeeth / IDLER.teeth);
      gearOmega['R'] = -idlerOmega * (IDLER.teeth / g.outputTeeth);
    } else {
      gearOmega[g.id] = -w.counterOmega * (g.counterTeeth / g.outputTeeth);
    }
  }

  // outputΩ: 既に各 tick で確定済み（詳細モードは主従で確定、初心者はここで確定）。
  // 初心者モードは PHASE1 どおりここで outputΩ を導出（tickBeginner では未確定のまま渡す）。
  if (st.mode === 'beginner') {
    if (sim.lockedGear !== 'N') {
      w.outputOmega = gearOmega[sim.lockedGear as GearId];
    } else {
      w.outputOmega = approach(w.outputOmega, 0, 6, dt);
    }
  }

  // ── 角度積分（全要素 angle += Ω × dt） ──
  sim.angles.input += w.inputOmega * dt;
  sim.angles.counter += w.counterOmega * dt;
  sim.angles.output += w.outputOmega * dt;
  sim.angles.idler += idlerOmega * dt;
  for (const g of GEARS) {
    sim.angles.gears[g.id] += gearOmega[g.id] * dt;
  }

  // ── sim 公開値の更新 ──
  sim.speeds.input = w.inputOmega;
  sim.speeds.counter = w.counterOmega;
  sim.speeds.output = w.outputOmega;

  // powerFlow = クラッチほぼ接続 && ロック中 && playing
  sim.powerFlow = sim.clutchGap < 0.15 && sim.lockedGear !== 'N' && st.playing;

  // 実RPM = Ω / VISUAL_SCALE（符号付き）。エンジンは state.rpm（クラッチ切断時もエンジンは回る）
  sim.rpms.engine = st.rpm;
  sim.rpms.input = w.inputOmega / VISUAL_SCALE;
  sim.rpms.counter = w.counterOmega / VISUAL_SCALE;
  sim.rpms.output = w.outputOmega / VISUAL_SCALE;

  // ── syncRate（シフト中=詳細モードの sync 表現の本体） ──
  // syncRate = clamp((SYNC_WINDOW − dogDiff)/(SYNC_WINDOW − ENGAGE_DOG_DIFF), 0, 1)
  const shifting = sim.phase !== 'idle';
  if (shifting && sim.targetGear !== 'N') {
    const dogDiff = computeDogDiff(w, sim.targetGear);
    sim.syncRate = clamp01((SYNC_WINDOW - dogDiff) / (SYNC_WINDOW - ENGAGE_DOG_DIFF));
  } else if (!shifting) {
    // 非シフト中: 係合済みは1、N は0
    sim.syncRate = sim.lockedGear !== 'N' ? 1 : 0;
  }

  // ── telemetry（単一情報源。useTransmissionState が100msでポーリング） ──
  // currentRpm = 入力軸の現在ギア回転数（=入力軸RPMの絶対値）
  const currentRpm = Math.abs(sim.rpms.input);
  const outputRpm = Math.abs(sim.rpms.output);
  // targetRpm: シフト中=目標ギアの matchΩ を実RPM化。
  //            非シフト中でギア係合済み=現在値(diff=0)。N かつ非シフト=null。
  let targetRpm: number | null;
  if (shifting && sim.targetGear !== 'N') {
    const matchO = matchInputOmega(sim.targetGear as GearId, w.outputOmega);
    targetRpm = Math.abs(matchO / VISUAL_SCALE);
  } else if (!shifting && sim.lockedGear !== 'N') {
    targetRpm = currentRpm; // 係合済みは現在値（diff=0）
  } else {
    targetRpm = null;
  }
  sim.telemetry.currentRpm = currentRpm;
  sim.telemetry.outputRpm = outputRpm;
  sim.telemetry.targetRpm = targetRpm;
  sim.telemetry.diffRpm = targetRpm === null ? null : Math.abs(currentRpm - targetRpm);
}
