// Clutch.tsx — フライホイール + クラッチディスク（開閉アニメ）
//
// x≈-4.6。エンジン側フライホイール（大円盤 r=0.9、エンジン視覚速度で自前積分回転）
// と入力軸側ディスク（r=0.75、sim.angles.input）。
// sim.clutchGap×0.25 だけ X 方向に離間（切断中は隙間が見える）。
// エンジンブロック: x<-5.3 に暗色の箱（回転しない）。
//
// エンジン側はsim外で state.rpm×VISUAL_SCALE から自前積分（playing凍結に従う）。
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimRef, GearboxState } from '../types';
import { applyTutorialEmissive } from '../tutorial/visuals';
import { MAIN_Y, VISUAL_SCALE } from '../data/gears';

interface Props {
  simRef: SimRef;
  state: GearboxState;
  engineHighlight?: boolean;
  clutchHighlight?: boolean;
}

const CLUTCH_X = -4.6;
const GAP_TRAVEL = 0.25;

export default function Clutch({
  simRef,
  state,
  engineHighlight = false,
  clutchHighlight = false,
}: Props) {
  const flywheelRef = useRef<THREE.Group>(null);
  const discRef = useRef<THREE.Group>(null);
  const flywheelMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const discMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const engineMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const engineAngle = useRef(0); // エンジン側の自前積分角

  useFrame(({ clock }, rawDt) => {
    const sim = simRef.current;
    if (!state.playing) return; // playing凍結に従う
    const dt = Math.min(rawDt, 0.05);

    // エンジン側フライホイール: state.rpm から自前積分（クラッチ状態に依らず常に回る）
    engineAngle.current += state.rpm * VISUAL_SCALE * dt;
    if (flywheelRef.current) {
      flywheelRef.current.rotation.x = engineAngle.current;
    }

    // 入力軸側ディスク: sim.angles.input。clutchGap×0.25 だけ X方向に離間。
    if (discRef.current) {
      discRef.current.rotation.x = sim.angles.input;
      discRef.current.position.x = CLUTCH_X + 0.18 + sim.clutchGap * GAP_TRAVEL;
    }

    applyTutorialEmissive(flywheelMatRef.current, engineHighlight || clutchHighlight, clock.elapsedTime);
    applyTutorialEmissive(discMatRef.current, clutchHighlight, clock.elapsedTime);
    applyTutorialEmissive(engineMatRef.current, engineHighlight, clock.elapsedTime, 'soft');
  });

  return (
    <group>
      {/* エンジン側フライホイール（大円盤） */}
      <group ref={flywheelRef} position={[CLUTCH_X - 0.05, MAIN_Y, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.9, 0.9, 0.16, 32]} />
          <meshStandardMaterial ref={flywheelMatRef} color="#475569" metalness={0.7} roughness={0.4} />
        </mesh>
        {/* リング状の縁取り（回転視認用の溝）。torusは穴軸=Z生成のため Y軸90°で X軸に巻き付ける */}
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.78, 0.04, 8, 32]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.5} />
        </mesh>
      </group>

      {/* 入力軸側クラッチディスク */}
      <group ref={discRef} position={[CLUTCH_X + 0.18, MAIN_Y, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.75, 0.75, 0.1, 32]} />
          <meshStandardMaterial ref={discMatRef} color="#94a3b8" metalness={0.65} roughness={0.45} />
        </mesh>
        {/* 摩擦面パッド（放射状の4枚）で回転視認 */}
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            rotation={[(i * Math.PI) / 2, 0, 0]}
            position={[0, 0, 0]}
          >
            <boxGeometry args={[0.06, 0.6, 0.06]} />
            <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* エンジンブロック（暗色の箱、回転しない） */}
      <mesh position={[-6.1, MAIN_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 1.6, 1.6]} />
        <meshStandardMaterial ref={engineMatRef} color="#1e293b" metalness={0.3} roughness={0.8} />
      </mesh>
    </group>
  );
}
