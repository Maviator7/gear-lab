// useTransmissionState.ts — App の全状態オーナー（PHASE2）。
//
// 役割:
//   - GearboxState（selectedGear/clutchEngaged/rpm/playing/mode）を保持。
//   - TransmissionState（公開状態機械）をイベント駆動＋クラッチトグル整合化で導出。
//   - simRef を createInitialSim() で生成・保持し Scene へ渡す（単一の Sim インスタンス）。
//   - telemetry を 100ms ポーリング（setInterval）で sim から読み取り React state に反映。
//   - fxRef（ガリガリFXチャネル）を保持し、警告時に bump。
//   - requestShift の検証（詳細モードのみ）を行い、検証済み変化だけ sim に届ける。
//
// sim(フレームループ) は setState しない。React への離散通知は handleSimEvent 経由。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { GearboxState, GearPosition, GearId, SimRef, Telemetry } from '../types';
import { createInitialSim } from './simInitial';

// ── 公開状態機械 ──────────────────────────────────────────────
export enum TransmissionState {
  NEUTRAL = 'NEUTRAL',                     // ギア未係合・クラッチ接続
  CLUTCH_DISENGAGED = 'CLUTCH_DISENGAGED', // クラッチ切断（変速準備OK）
  SYNCHRONIZING = 'SYNCHRONIZING',         // スリーブ押付・回転同期中
  READY_TO_ENGAGE = 'READY_TO_ENGAGE',     // 同期完了・ドグ係合中（遷移的）
  ENGAGED = 'ENGAGED',                     // ギア係合済み
  SHIFT_FAILED = 'SHIFT_FAILED',           // 変速失敗（2.5sの過渡表示）
}

export type FailReason = 'clutchEngaged' | 'syncTimeout' | 'clutchDuringSync';

export interface Warning {
  kind: FailReason;
  lines: string[]; // 例 ['⚠ ギアが入りません', '⚠ クラッチを切ってください']
}

/** sim(フレームループ) → React への離散イベント */
export type TransmissionEvent =
  | { type: 'synchroStart'; gear: GearId }
  | { type: 'syncReady' }                          // 同期100%到達、ドグ係合開始
  | { type: 'engaged'; gear: GearPosition }        // 係合完了（'N'含む）
  | { type: 'shiftFailed'; reason: 'syncTimeout' | 'clutchDuringSync' };

// Telemetry 型は types.ts に集約（DESIGN-PHASE2 の Telemetry をそのまま使用）。再エクスポート。
export type { Telemetry } from '../types';

/** FXチャネル（React→Canvas、可変refで伝達） */
export interface FxState {
  grindId: number;           // インクリメントで発火通知
  grindGear: GearId | null;  // エフェクト位置のギア
}

// 警告の自動消滅・SHIFT_FAILED 表示時間
const FAILED_DISPLAY_MS = 2500;
// telemetry ポーリング間隔
const POLL_MS = 100;

const INITIAL_STATE: GearboxState = {
  selectedGear: 'N',
  clutchEngaged: true,
  rpm: 1200,
  playing: true,
  mode: 'beginner',
};

// 警告文（DESIGN-PHASE2）
const WARNINGS: Record<FailReason, string[]> = {
  clutchEngaged: ['⚠ ギアが入りません', '⚠ クラッチを切ってください'],
  syncTimeout: ['⚠ ギアが入りません', '⚠ 回転差が大きすぎます'],
  clutchDuringSync: ['⚠ ギアが入りません', '⚠ シンクロ中にクラッチが接続されました'],
};

export interface TransmissionApi {
  state: GearboxState;
  tState: TransmissionState;
  warning: Warning | null;
  telemetry: Telemetry;
  simRef: SimRef;
  fxRef: MutableRefObject<FxState>;
  requestShift: (g: GearPosition) => void;
  toggleClutch: () => void;
  setRpm: (rpm: number) => void;
  togglePlay: () => void;
  toggleMode: () => void;
  handleSimEvent: (e: TransmissionEvent) => void;
}

export function useTransmissionState(): TransmissionApi {
  const [state, setState] = useState<GearboxState>(INITIAL_STATE);
  const [tState, setTState] = useState<TransmissionState>(TransmissionState.NEUTRAL);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    currentRpm: 0,
    outputRpm: 0,
    targetRpm: null,
    diffRpm: null,
    syncRate: 0,
  });

  // 単一の Sim インスタンス（Scene と共有）
  const simRef = useRef(createInitialSim());
  const fxRef = useRef<FxState>({ grindId: 0, grindGear: null });

  // SHIFT_FAILED 復帰タイマー
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最新 state を ref で参照（タイマーコールバック等から）
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── FX bump ヘルパ ────────────────────────────────────────
  const bumpFx = useCallback((gear: GearId | null) => {
    fxRef.current.grindId += 1;
    fxRef.current.grindGear = gear;
  }, []);

  // ── SHIFT_FAILED の復帰先導出 ─────────────────────────────
  // clutchEngaged ? (locked!=N ? ENGAGED : NEUTRAL) : CLUTCH_DISENGAGED
  const recoverFromFailed = useCallback(() => {
    const st = stateRef.current;
    const locked = simRef.current.lockedGear;
    if (st.clutchEngaged) {
      setTState(locked !== 'N' ? TransmissionState.ENGAGED : TransmissionState.NEUTRAL);
    } else {
      setTState(TransmissionState.CLUTCH_DISENGAGED);
    }
    setWarning(null);
  }, []);

  // 失敗共通処理: warning 表示 + SHIFT_FAILED(2.5s) + 復帰タイマー
  const enterFailed = useCallback(
    (reason: FailReason) => {
      setWarning({ kind: reason, lines: WARNINGS[reason] });
      setTState(TransmissionState.SHIFT_FAILED);
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
      failTimerRef.current = setTimeout(() => {
        failTimerRef.current = null;
        recoverFromFailed();
      }, FAILED_DISPLAY_MS);
    },
    [recoverFromFailed],
  );

  // ── sim → React イベント処理（Scene の onEvent に配線） ─────
  const handleSimEvent = useCallback(
    (e: TransmissionEvent) => {
      switch (e.type) {
        case 'synchroStart':
          setTState(TransmissionState.SYNCHRONIZING);
          break;
        case 'syncReady':
          setTState(TransmissionState.READY_TO_ENGAGE);
          break;
        case 'engaged':
          // SHIFT_FAILED 表示中はタイマー優先（係合完了が無くても N に戻っている）
          if (failTimerRef.current) break;
          setTState(e.gear !== 'N' ? TransmissionState.ENGAGED : TransmissionState.NEUTRAL);
          break;
        case 'shiftFailed':
          // selectedGear='N' に戻す（sim は lockedGear='N' 据え置き、メカは既にニュートラル）
          setState((s) => ({ ...s, selectedGear: 'N' }));
          enterFailed(e.reason);
          // ギア付近に FX。直前の対象ギア（sim.targetGear は失敗時 'N' 化済みなので
          // selectedGear を使う）。selectedGear が N の場合は現ロックで代替。
          {
            const sel = stateRef.current.selectedGear;
            const fxGear: GearId | null = sel !== 'N' ? (sel as GearId) : null;
            bumpFx(fxGear);
          }
          break;
      }
    },
    [enterFailed, bumpFx],
  );

  // ── telemetry 100ms ポーリング（単一情報源は sim） ─────────
  useEffect(() => {
    const id = setInterval(() => {
      const sim = simRef.current;
      const t = sim.telemetry;
      setTelemetry({
        currentRpm: Math.round(t.currentRpm),
        outputRpm: Math.round(t.outputRpm),
        targetRpm: t.targetRpm === null ? null : Math.round(t.targetRpm),
        diffRpm: t.diffRpm === null ? null : Math.round(t.diffRpm),
        syncRate: sim.syncRate,
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
    };
  }, []);

  // ── 操作: requestShift（検証あり） ────────────────────────
  const requestShift = useCallback(
    (g: GearPosition) => {
      setState((s) => {
        // 同一ギアは無視
        if (g === s.selectedGear) return s;

        // 初心者モードは常に受理（自動クラッチ）
        if (s.mode === 'beginner') {
          return { ...s, selectedGear: g };
        }

        // ── 詳細モードの検証 ──
        // クラッチ接続中 → 拒否: selectedGear は変えない。SHIFT_FAILED + 警告 + FX bump。
        if (s.clutchEngaged) {
          enterFailed('clutchEngaged');
          // FX: grindGear = 対象ギア。g==='N' なら現ロックギア、それもなければ FXなし。
          let fxGear: GearId | null = null;
          if (g !== 'N') fxGear = g as GearId;
          else if (simRef.current.lockedGear !== 'N') fxGear = simRef.current.lockedGear as GearId;
          if (fxGear !== null) bumpFx(fxGear);
          return s; // selectedGear 不変
        }

        // クラッチ切断中 → 受理: simが検知してシーケンス開始
        return { ...s, selectedGear: g };
      });
    },
    [enterFailed, bumpFx],
  );

  // ── 操作: toggleClutch（トグル時に tState 即時再導出） ─────
  const toggleClutch = useCallback(() => {
    setState((s) => {
      const next = !s.clutchEngaged;
      // SHIFT_FAILED 表示中はタイマー優先（再導出しない）
      if (!failTimerRef.current) {
        const locked = simRef.current.lockedGear;
        // クラッチ切 → CLUTCH_DISENGAGED（シフト中でなければ）
        // クラッチ接続 → ENGAGED or NEUTRAL
        setTState((prev) => {
          // シフト進行中（SYNCHRONIZING / READY_TO_ENGAGE）はそのまま
          // （sim 側で clutchDuringSync 失敗を検知してイベントを送る）
          if (prev === TransmissionState.SYNCHRONIZING || prev === TransmissionState.READY_TO_ENGAGE) {
            return prev;
          }
          if (!next) return TransmissionState.CLUTCH_DISENGAGED;
          return locked !== 'N' ? TransmissionState.ENGAGED : TransmissionState.NEUTRAL;
        });
      }
      return { ...s, clutchEngaged: next };
    });
  }, []);

  const setRpm = useCallback((rpm: number) => {
    setState((s) => ({ ...s, rpm }));
  }, []);

  const togglePlay = useCallback(() => {
    setState((s) => ({ ...s, playing: !s.playing }));
  }, []);

  // モード切替: detail→beginner で rpm を 3000 にクランプ
  const toggleMode = useCallback(() => {
    setState((s) => {
      const nextMode = s.mode === 'beginner' ? 'detail' : 'beginner';
      const nextRpm = nextMode === 'beginner' ? Math.min(s.rpm, 3000) : s.rpm;
      return { ...s, mode: nextMode, rpm: nextRpm };
    });
    // モード切替時は失敗表示・警告をクリアし、tState を中立寄りに整える
    if (failTimerRef.current) {
      clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
    setWarning(null);
    setTState((prev) => {
      if (prev === TransmissionState.SHIFT_FAILED) return TransmissionState.NEUTRAL;
      return prev;
    });
  }, []);

  return {
    state,
    tState,
    warning,
    telemetry,
    simRef,
    fxRef,
    requestShift,
    toggleClutch,
    setRpm,
    togglePlay,
    toggleMode,
    handleSimEvent,
  };
}
