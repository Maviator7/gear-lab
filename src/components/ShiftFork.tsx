// ShiftFork.tsx — シフトフォーク（スリーブに追従）
//
// スリーブを上から掴むU字形状（torus半分 r≈0.45 + 上方への柄 + 上部に水平シフトロッド）。
// x位置はスリーブに追従（hubX + sim.sleeves[hub]×SLEEVE_TRAVEL）。
// 担当ハブの glow>0 またはスリーブ≠0 のとき色を amber に。3本（各ハブ）。
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimRef, HubId } from '../types';
import { HUBS, MAIN_Y, SLEEVE_TRAVEL } from '../data/gears';

interface Props {
  hub: HubId;
  simRef: SimRef;
}

const ROD_Y = MAIN_Y + 1.3; // シフトロッドの高さ
const COLOR_IDLE = new THREE.Color('#64748b');
const COLOR_ACTIVE = new THREE.Color('#f59e0b'); // amber

export default function ShiftFork({ hub, simRef }: Props) {
  const hubX = HUBS[hub];
  const groupRef = useRef<THREE.Group>(null);
  const matRefs = useRef<THREE.MeshStandardMaterial[]>([]);

  useFrame(() => {
    const sim = simRef.current;
    const g = groupRef.current;
    if (!g) return;
    // スリーブのx位置に追従（フォークは回転しない）
    g.position.x = hubX + sim.sleeves[hub] * SLEEVE_TRAVEL;

    // 担当ハブが作動中なら amber
    const active = sim.synchroGlow[hub] > 0.05 || Math.abs(sim.sleeves[hub]) > 0.05;
    const target = active ? COLOR_ACTIVE : COLOR_IDLE;
    for (const m of matRefs.current) {
      if (m) m.color.lerp(target, 0.2);
    }
  });

  const setMat = (i: number) => (m: THREE.MeshStandardMaterial | null) => {
    if (m) matRefs.current[i] = m;
  };

  return (
    <group ref={groupRef} position={[hubX, MAIN_Y, 0]}>
      {/* U字（スリーブを上から掴む半トーラス、上半分）。
          頂点 (0, 0.45, 0) が柄の根元と一致するよう上半円にする */}
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.45, 0.04, 8, 16, Math.PI]} />
        <meshStandardMaterial ref={setMat(0)} color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* 柄（上方へ伸びる縦棒） */}
      <mesh position={[0, (0.45 + ROD_Y - MAIN_Y) / 2, 0]}>
        <boxGeometry args={[0.07, ROD_Y - MAIN_Y - 0.45, 0.07]} />
        <meshStandardMaterial ref={setMat(1)} color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* 上部の水平シフトロッド接続部 */}
      <mesh position={[0, ROD_Y - MAIN_Y, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 12]} />
        <meshStandardMaterial ref={setMat(2)} color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}
