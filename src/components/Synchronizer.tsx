// Synchronizer.tsx — ハブ + スリーブ + シンクロリング（スライド + 発光）
//
// 各ハブ(HUBS座標, y=MAIN_Y):
//   ハブリング(r≈0.32, 幅0.28、出力軸と共回転=sim.angles.output)
//   スリーブ(r≈0.38, 幅0.3、x = hubX + sim.sleeves[hub]×SLEEVE_TRAVEL、出力軸と共回転)
//   両側シンクロリング（細トーラス r≈0.3、sim.synchroGlow[hub]で emissiveIntensity 0→3、orange）
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimRef, HubId } from '../types';
import { HUBS, MAIN_Y, SLEEVE_TRAVEL } from '../data/gears';

interface Props {
  hub: HubId;
  simRef: SimRef;
  tutorialHighlight?: boolean;
}

const COLOR_TUTORIAL = new THREE.Color('#22d3ee');
const COLOR_SYNC = new THREE.Color('#f97316');

function applyTutorialHighlight(
  mat: THREE.MeshStandardMaterial | null,
  active: boolean,
  elapsedTime: number,
) {
  if (!mat) return;
  if (active) {
    mat.emissive.copy(COLOR_TUTORIAL);
    mat.emissiveIntensity = 0.28 + Math.sin(elapsedTime * 4) * 0.08;
  } else {
    mat.emissive.setRGB(0, 0, 0);
    mat.emissiveIntensity = 0;
  }
}

export default function Synchronizer({ hub, simRef, tutorialHighlight = false }: Props) {
  const hubX = HUBS[hub];
  const hubRef = useRef<THREE.Group>(null);
  const sleeveRef = useRef<THREE.Group>(null);
  const hubMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const sleeveMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringLeftRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringRightRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const sim = simRef.current;
    // ハブ・スリーブは出力軸と共回転
    if (hubRef.current) hubRef.current.rotation.x = sim.angles.output;
    if (sleeveRef.current) {
      sleeveRef.current.rotation.x = sim.angles.output;
      sleeveRef.current.position.x = hubX + sim.sleeves[hub] * SLEEVE_TRAVEL;
    }
    applyTutorialHighlight(hubMatRef.current, tutorialHighlight, clock.elapsedTime);
    applyTutorialHighlight(sleeveMatRef.current, tutorialHighlight, clock.elapsedTime);

    // シンクロリング発光: 作動中のorangeを最優先。非作動時のみtutorial cyan。
    const glow = sim.synchroGlow[hub] * 3;
    for (const mat of [ringLeftRef.current, ringRightRef.current]) {
      if (!mat) continue;
      if (glow > 0.01) {
        mat.emissive.copy(COLOR_SYNC);
        mat.emissiveIntensity = glow;
      } else if (tutorialHighlight) {
        mat.emissive.copy(COLOR_TUTORIAL);
        mat.emissiveIntensity = 0.35 + Math.sin(clock.elapsedTime * 4) * 0.08;
      } else {
        mat.emissive.copy(COLOR_SYNC);
        mat.emissiveIntensity = 0;
      }
    }
  });

  return (
    <group position={[0, MAIN_Y, 0]}>
      {/* ハブリング（固定中心、出力軸と共回転） */}
      <group ref={hubRef} position={[hubX, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.28, 24]} />
          <meshStandardMaterial ref={hubMatRef} color="#52525b" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>

      {/* スリーブ（軸方向スライド、出力軸と共回転） */}
      <group ref={sleeveRef} position={[hubX, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.3, 24, 1, true]} />
          <meshStandardMaterial
            ref={sleeveMatRef}
            color="#9ca3af"
            metalness={0.75}
            roughness={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* スリーブ外周の溝（フォークが掴む位置）。torusは穴軸=Z生成のため Y軸90°で X軸に巻き付ける */}
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.39, 0.025, 8, 24]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.5} />
        </mesh>
      </group>

      {/* 両側シンクロリング（細トーラス、orange発光） */}
      <mesh position={[hubX - 0.22, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.3, 0.03, 10, 24]} />
        <meshStandardMaterial
          ref={ringLeftRef}
          color="#fb923c"
          emissive="#f97316"
          emissiveIntensity={0}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[hubX + 0.22, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.3, 0.03, 10, 24]} />
        <meshStandardMaterial
          ref={ringRightRef}
          color="#fb923c"
          emissive="#f97316"
          emissiveIntensity={0}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}
