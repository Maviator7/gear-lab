// GearboxScene.tsx — Canvas内ルート。ライト、OrbitControls、全パーツ配置。
//
// アーキテクチャ:
//   GearboxScene が <Canvas> を返し、その中に <GearboxAssembly />（同ファイル内）を置く。
//   Assembly内で useGearboxAnimation を呼び、sim(SimRef) を各3D子に props で渡す。
//   各子は自分の useFrame で sim.current を読み rotation/position/material を直接更新する。
//   React再レンダーは state props 変化時のみ（useFrame内 setState 禁止）。
import { useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type { GearId, GearPosition, Sim, SimRef, GearboxState } from '../types';
import type { TutorialHighlight } from '../tutorial/types';
import type { TransmissionEvent, FxState } from '../hooks/useTransmissionState';
import {
  GEARS,
  HUBS,
  CONSTANT_MESH,
  IDLER,
  MODULE,
  MAIN_Y,
  COUNTER_Y,
} from '../data/gears';
import { useGearboxAnimation } from '../hooks/useGearboxAnimation';
import Gear, { type GearVisualMode } from './Gear';
import Shaft from './Shaft';
import Clutch from './Clutch';
import Synchronizer from './Synchronizer';
import ShiftFork from './ShiftFork';
import RotationArrow from './RotationArrow';
import GrindEffect from './GrindEffect';

interface Props {
  state: GearboxState;
  simRef: SimRef;
  fxRef: MutableRefObject<FxState>;
  onEvent?: (e: TransmissionEvent) => void;
  tutorialHighlights?: TutorialHighlight[];
}

// ピッチ半径
function pitchRadius(teeth: number): number {
  return (MODULE * teeth) / 2;
}

// リバース段スペック（アイドラー回転数の導出に使用）
const R_SPEC = GEARS.find((g) => g.id === 'R')!;

// 軸範囲（DESIGN.md）
const INPUT_SHAFT = { x1: -5.3, x2: -3.0, r: 0.14 };
const OUTPUT_SHAFT = { x1: -3.0, x2: 5.6, r: 0.14 };
const COUNTER_SHAFT = { x1: -3.9, x2: 5.2, r: 0.11 };

export default function GearboxScene({ state, simRef, fxRef, onEvent, tutorialHighlights = [] }: Props) {
  const tutorialActive = tutorialHighlights.length > 0;

  return (
    <Canvas shadows="soft" dpr={[1, 2]} camera={{ position: [6, 4, 9], fov: 45 }}>
      {/* 背景・fog */}
      <color attach="background" args={['#0b1020']} />
      <fog attach="fog" args={['#0b1020', 16, 40]} />

      <WorkshopLighting tutorialActive={tutorialActive} />

      <GearboxAssembly
        state={state}
        simRef={simRef}
        fxRef={fxRef}
        onEvent={onEvent}
        tutorialHighlights={tutorialHighlights}
      />

      {/* 床グリッド */}
      <Grid
        position={[0, -2.2, 0]}
        infiniteGrid
        cellSize={0.5}
        cellThickness={0.5}
        sectionSize={2.5}
        sectionThickness={1}
        cellColor="#1e2a44"
        sectionColor="#2c3e63"
        fadeDistance={45}
        fadeStrength={1.5}
      />

      <OrbitControls makeDefault enableDamping target={[0, 0, 0]} />
      <TutorialPostProcessing active={tutorialActive} />
    </Canvas>
  );
}

function WorkshopLighting({ tutorialActive }: { tutorialActive: boolean }) {
  return (
    <>
      <ambientLight intensity={0.38} />
      <hemisphereLight color="#dbeafe" groundColor="#0f172a" intensity={0.6} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0001}
      />
      <directionalLight position={[-7, 4, -7]} intensity={0.85} color="#93c5fd" />
      <pointLight
        position={[-4.8, 1.8, 2.6]}
        color="#22d3ee"
        intensity={tutorialActive ? 1.2 : 0.25}
        distance={8}
        decay={2}
      />
      <pointLight
        position={[4.2, 1.2, -2.4]}
        color="#f59e0b"
        intensity={0.35}
        distance={9}
        decay={2}
      />
    </>
  );
}

function TutorialPostProcessing({ active }: { active: boolean }) {
  return (
    <EffectComposer enabled={active} multisampling={0}>
      <Bloom
        intensity={0.55}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.7}
        mipmapBlur
        radius={0.55}
      />
      <Vignette offset={0.35} darkness={0.35} />
    </EffectComposer>
  );
}

// ── 動力経路ハイライト判定 ────────────────────────────────
// powerFlow時の動力経路 = [入力軸, 入力ギア, カウンター常時ギア, カウンター軸,
//   ロック段のカウンター側ギア, (Rならアイドラー), ロック段の出力側ギア, ロックハブのスリーブ, 出力軸]
// 出力側の非ロックギアは常に opacity 0.45（空転表現）。
// selectedGear の段は cyan系で識別。

// ハブ上のギアの表示状態を決める
function outputGearVisual(
  sim: Sim,
  gearId: GearId,
  selectedGear: GearPosition,
): GearVisualMode {
  const locked = sim.lockedGear === gearId;
  if (locked && sim.powerFlow) return 'powered'; // 動力伝達中=amber
  if (selectedGear === gearId && sim.phase !== 'idle') return 'selected'; // 選択段（シフト中）=cyan
  if (locked) return 'normal'; // ロック済みだが動力未伝達
  return 'free'; // 非ロック=空転(opacity 0.45)
}

function hasHighlight(highlights: TutorialHighlight[], target: TutorialHighlight): boolean {
  return highlights.includes(target);
}

function isGearHighlighted(highlights: TutorialHighlight[], gear: GearId): boolean {
  if (gear === '1') return hasHighlight(highlights, 'gear-1');
  if (gear === '5') return hasHighlight(highlights, 'gear-5');
  return false;
}

function GearboxAssembly({ state, simRef, fxRef, onEvent, tutorialHighlights = [] }: Props) {
  // PHASE2: simRef は外部(useTransmissionState)生成。フックは void を返し sim を毎フレーム書き換える。
  useGearboxAnimation(simRef, state, onEvent);
  const sim = simRef;
  const highlightGearTrain = hasHighlight(tutorialHighlights, 'gear-train');
  const highlightEngine = hasHighlight(tutorialHighlights, 'engine');
  const highlightClutch = hasHighlight(tutorialHighlights, 'clutch');
  const highlightOutputShaft = hasHighlight(tutorialHighlights, 'output-shaft');
  const highlightSynchronizer = hasHighlight(tutorialHighlights, 'synchronizer');

  // ── 入力軸・出力軸・カウンター軸 ──────────────────────────
  const inputAngle = (s: Sim) => s.angles.input;
  const outputAngle = (s: Sim) => s.angles.output;
  const counterAngle = (s: Sim) => s.angles.counter;

  // 入力ギア(21T)・常時噛合ギア(29T)の表示: 動力は常にここを流れる（クラッチ接続時）
  const inputChainVisual = (s: Sim): GearVisualMode =>
    s.clutchGap < 0.15 && Math.abs(s.speeds.input) > 0.001 ? 'powered' : 'normal';

  return (
    <group>
      {/* ── 軸 ──────────────────────────────────────────── */}
      <Shaft {...{ x1: INPUT_SHAFT.x1, x2: INPUT_SHAFT.x2 }} y={MAIN_Y} radius={INPUT_SHAFT.r} simRef={sim} getAngle={inputAngle} color="#7b8494" tutorialHighlight={highlightGearTrain} tutorialHighlightStrength="soft" />
      <Shaft {...{ x1: OUTPUT_SHAFT.x1, x2: OUTPUT_SHAFT.x2 }} y={MAIN_Y} radius={OUTPUT_SHAFT.r} simRef={sim} getAngle={outputAngle} color="#7b8494" tutorialHighlight={highlightOutputShaft} />
      <Shaft {...{ x1: COUNTER_SHAFT.x1, x2: COUNTER_SHAFT.x2 }} y={COUNTER_Y} radius={COUNTER_SHAFT.r} simRef={sim} getAngle={counterAngle} color="#6b7484" tutorialHighlight={highlightGearTrain} tutorialHighlightStrength="soft" />
      {/* アイドラー軸（短い細軸） */}
      <Shaft x1={IDLER.x - 0.25} x2={IDLER.x + 0.25} y={IDLER.y} z={IDLER.z} radius={0.07} simRef={sim} getAngle={(s) => s.angles.idler} color="#6b7484" />

      {/* ── クラッチ + フライホイール + エンジンブロック ──────── */}
      <Clutch simRef={sim} state={state} engineHighlight={highlightEngine} clutchHighlight={highlightClutch} />

      {/* ── 常時噛合段（入力21T / カウンター29T, x=-3.4） ──────── */}
      <Gear
        teeth={CONSTANT_MESH.inputTeeth}
        color="#8b95a7"
        position={[CONSTANT_MESH.x, MAIN_Y, 0]}
        simRef={sim}
        getAngle={inputAngle}
        visual={inputChainVisual}
        tutorialHighlight={highlightGearTrain}
        tutorialHighlightStrength="soft"
      />
      <Gear
        teeth={CONSTANT_MESH.counterTeeth}
        color="#8b95a7"
        position={[CONSTANT_MESH.x, COUNTER_Y, 0]}
        simRef={sim}
        getAngle={counterAngle}
        visual={inputChainVisual}
        tutorialHighlight={highlightGearTrain}
        tutorialHighlightStrength="soft"
      />

      {/* ── 各変速段ギア ──────────────────────────────────── */}
      {GEARS.map((g) => {
        const counterR = pitchRadius(g.counterTeeth);
        const outputR = pitchRadius(g.outputTeeth);
        const gearHighlight = highlightGearTrain || isGearHighlighted(tutorialHighlights, g.id);
        // カウンター側ギア（y=COUNTER_Y、カウンター角で回転）。動力経路は powerFlow && ロック段。
        const counterVisual = (s: Sim): GearVisualMode => {
          if (s.lockedGear === g.id && s.powerFlow) return 'powered';
          if (state.selectedGear === g.id && s.phase !== 'idle') return 'selected';
          return 'normal'; // カウンター側は軸固定なので常に回る（空転表現はしない）
        };
        return (
          <group key={g.id}>
            {/* カウンター側ギア */}
            <Gear
              teeth={g.counterTeeth}
              color="#8390a3"
              position={[g.x, COUNTER_Y, 0]}
              simRef={sim}
              getAngle={counterAngle}
              visual={counterVisual}
              tutorialHighlight={gearHighlight}
              tutorialHighlightStrength={highlightGearTrain ? 'soft' : 'strong'}
            />
            {/* 出力側ギア（常時噛合・空転 or ロック） */}
            <Gear
              teeth={g.outputTeeth}
              color="#8390a3"
              position={[g.x, MAIN_Y, 0]}
              simRef={sim}
              getAngle={(s) => s.angles.gears[g.id]}
              visual={(s) => outputGearVisual(s, g.id, state.selectedGear)}
              tutorialHighlight={gearHighlight}
              tutorialHighlightStrength={highlightGearTrain ? 'soft' : 'strong'}
            />
            {/* 詳細モード: 歯数バッジ（出力側ギア上） */}
            {state.mode === 'detail' && (
              <Html position={[g.x, MAIN_Y + outputR + 0.18, 0]} center distanceFactor={12}>
                <div className="px-1.5 py-0.5 rounded bg-slate-800/80 text-cyan-300 text-[10px] font-mono whitespace-nowrap">
                  {g.outputTeeth}T
                </div>
              </Html>
            )}
            {state.mode === 'detail' && (
              <Html position={[g.x, COUNTER_Y - counterR - 0.18, 0]} center distanceFactor={12}>
                <div className="px-1.5 py-0.5 rounded bg-slate-800/80 text-amber-300 text-[10px] font-mono whitespace-nowrap">
                  {g.counterTeeth}T
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* ── リバースアイドラー（IDLER座標） ───────────────────── */}
      <Gear
        teeth={IDLER.teeth}
        thickness={0.35}
        color="#8390a3"
        position={[IDLER.x, IDLER.y, IDLER.z]}
        simRef={sim}
        getAngle={(s) => s.angles.idler}
        visual={(s) =>
          s.lockedGear === 'R' && s.powerFlow ? 'powered' : 'free'
        }
        tutorialHighlight={highlightGearTrain}
        tutorialHighlightStrength="soft"
      />

      {/* ── シンクロナイザー（3ハブ） + シフトフォーク ──────────── */}
      {(Object.keys(HUBS) as (keyof typeof HUBS)[]).map((hub) => (
        <group key={hub}>
          <Synchronizer hub={hub} simRef={sim} tutorialHighlight={highlightSynchronizer} />
          <ShiftFork hub={hub} simRef={sim} />
        </group>
      ))}

      {/* ── 回転方向矢印 ───────────────────────────────────── */}
      {/* 入力軸端(x=-5.0) */}
      <RotationArrow position={[-5.0, MAIN_Y, 0]} baseRadius={INPUT_SHAFT.r} simRef={sim} getAngle={inputAngle} getRpm={(s) => s.rpms.input} />
      {/* カウンター軸両端 */}
      <RotationArrow position={[COUNTER_SHAFT.x1 + 0.1, COUNTER_Y, 0]} baseRadius={COUNTER_SHAFT.r} simRef={sim} getAngle={counterAngle} getRpm={(s) => s.rpms.counter} />
      <RotationArrow position={[COUNTER_SHAFT.x2 - 0.1, COUNTER_Y, 0]} baseRadius={COUNTER_SHAFT.r} simRef={sim} getAngle={counterAngle} getRpm={(s) => s.rpms.counter} />
      {/* 出力軸端(x=5.4) */}
      <RotationArrow position={[5.4, MAIN_Y, 0]} baseRadius={OUTPUT_SHAFT.r} simRef={sim} getAngle={outputAngle} getRpm={(s) => s.rpms.output} />
      {/* アイドラー（idlerΩ = -counterΩ × Rカウンター歯数/アイドラー歯数） */}
      <RotationArrow position={[IDLER.x, IDLER.y, IDLER.z]} baseRadius={0.07} simRef={sim} getAngle={(s) => s.angles.idler} getRpm={(s) => -s.rpms.counter * (R_SPEC.counterTeeth / IDLER.teeth)} />

      {/* ── 失敗演出 ───────────────────────────────────────── */}
      <GrindEffect fxRef={fxRef} playing={state.playing} />

      {/* ── ラベル ─────────────────────────────────────────── */}
      <SceneLabels mode={state.mode} simRef={sim} />
    </group>
  );
}

// ── ラベル（beginner: 部品名 / detail: 軸RPM） ─────────────
function SceneLabels({ mode, simRef }: { mode: GearboxState['mode']; simRef: SimRef }) {
  if (mode === 'beginner') {
    return (
      <group>
        <PartLabel position={[-6.1, MAIN_Y + 1.0, 0]} text="エンジン" />
        <PartLabel position={[-4.6, MAIN_Y + 1.1, 0]} text="クラッチ" />
        <PartLabel position={[-3.4, MAIN_Y + 0.7, 0]} text="入力軸" />
        <PartLabel position={[0.5, COUNTER_Y - 1.3, 0]} text="カウンターシャフト" />
        <PartLabel position={[5.4, MAIN_Y + 0.6, 0]} text="出力軸" />
        {GEARS.map((g) => (
          <PartLabel key={g.id} position={[g.x, MAIN_Y + 1.55, 0]} text={g.label} small />
        ))}
        <PartLabel position={[HUBS.h34, MAIN_Y + 0.9, 0]} text="シンクロナイザー" small />
        <PartLabel position={[IDLER.x, IDLER.y - 0.5, IDLER.z]} text="アイドルギア" small />
      </group>
    );
  }
  // detailモード: 各軸端に live RPM（専用スロットルコンポーネント）
  return (
    <group>
      <RpmLabel position={[-5.0, MAIN_Y + 0.55, 0]} label="入力軸" simRef={simRef} pick={(s) => s.rpms.input} />
      <RpmLabel position={[0.5, COUNTER_Y - 1.1, 0]} label="カウンター" simRef={simRef} pick={(s) => s.rpms.counter} />
      <RpmLabel position={[5.4, MAIN_Y + 0.55, 0]} label="出力軸" simRef={simRef} pick={(s) => s.rpms.output} />
      <RpmLabel position={[-6.1, MAIN_Y + 1.0, 0]} label="エンジン" simRef={simRef} pick={(s) => s.rpms.engine} />
    </group>
  );
}

function PartLabel({ position, text, small }: { position: [number, number, number]; text: string; small?: boolean }) {
  return (
    <Html position={position} center distanceFactor={12} zIndexRange={[10, 0]}>
      <div
        className={`px-2 py-0.5 rounded-full bg-slate-800/85 border border-slate-600 text-slate-200 whitespace-nowrap ${
          small ? 'text-[10px]' : 'text-xs font-semibold'
        }`}
      >
        {text}
      </div>
    </Html>
  );
}

// live RPM ラベル: HtmlはuseFrameで書き換えできないので、ローカルstateを 3Hz でthrottle更新する。
// （useFrame内setState禁止の唯一の例外。useRefの時刻でthrottle必須）
function RpmLabel({
  position,
  label,
  simRef,
  pick,
}: {
  position: [number, number, number];
  label: string;
  simRef: SimRef;
  pick: (s: Sim) => number;
}) {
  const [rpm, setRpm] = useState(0);
  const lastUpdate = useRef(0);

  useFrame((stateThree) => {
    const t = stateThree.clock.elapsedTime;
    if (t - lastUpdate.current < 0.33) return; // 約3Hz でthrottle
    lastUpdate.current = t;
    const v = Math.round(pick(simRef.current));
    setRpm((prev) => (prev === v ? prev : v));
  });

  return (
    <Html position={position} center distanceFactor={12} zIndexRange={[10, 0]}>
      <div className="px-2 py-0.5 rounded bg-slate-800/85 border border-slate-600 whitespace-nowrap text-[10px]">
        <span className="text-slate-400">{label} </span>
        <span className="font-mono text-cyan-300">{rpm} rpm</span>
      </div>
    </Html>
  );
}
