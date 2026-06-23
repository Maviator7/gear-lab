// Shaft.tsx — 軸（X軸方向の円柱）
//
// cylinderGeometry を rotation.z=π/2 で X軸方向に寝かせる。
// 軸にも回転が見えるよう、表面に細いリブ（小boxを4本、十字配置）を付ける。
// 回転角は sim から getAngle で取得し、group.rotation.x を直接更新。
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimRef, Sim } from '../types';
import type { TutorialHighlightStrength } from '../tutorial/types';
import { applyTutorialEmissive } from '../tutorial/visuals';

interface Props {
  x1: number;
  x2: number;
  y: number;
  z?: number;
  radius: number;
  color?: string;
  simRef: SimRef;
  getAngle: (sim: Sim) => number;
  tutorialHighlight?: boolean;
  tutorialHighlightStrength?: TutorialHighlightStrength;
}

export default function Shaft({
  x1,
  x2,
  y,
  z = 0,
  radius,
  color = '#6b7280',
  simRef,
  getAngle,
  tutorialHighlight = false,
  tutorialHighlightStrength = 'strong',
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const length = Math.abs(x2 - x1);
  const cx = (x1 + x2) / 2;

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    g.rotation.x = getAngle(simRef.current); // 軸 +X まわりに共回転

    const mat = matRef.current;
    if (!mat) return;
    applyTutorialEmissive(mat, tutorialHighlight, clock.elapsedTime, tutorialHighlightStrength);
  });

  // 表面リブ（十字4本）: 軸に沿った細い box。共回転で回転が視認できる。
  const ribLen = length * 0.96;
  const ribOffset = radius * 0.92;

  return (
    <group ref={groupRef} position={[cx, y, z]}>
      {/* 本体円柱: cylinderはY軸方向 → Z軸まわり90°でX方向へ寝かせる */}
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, length, 20]} />
        <meshStandardMaterial ref={matRef} color={color} metalness={0.6} roughness={0.45} />
      </mesh>
      {/* 十字リブ（X方向に長いbox） */}
      <RibCross length={ribLen} offset={ribOffset} color={color} />
    </group>
  );
}

// 内部: 円柱本体を X 方向に寝かせ、十字リブを配置するサブツリー。
// （上の mesh は Y 方向のままなので、ここで全体を Z軸90°回したグループに収める）
function RibCross({ length, offset, color }: { length: number; offset: number; color: string }) {
  const rib = (rot: number) => (
    <mesh rotation={[rot, 0, 0]} position={[0, 0, 0]}>
      <boxGeometry args={[length, 0.012, 0.012]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.5} />
    </mesh>
  );
  // boxはローカルX方向に長い。Y方向にoffsetだけ離してX軸まわりに4方向へ。
  return (
    <group>
      <group position={[0, offset, 0]}>{rib(0)}</group>
      <group position={[0, -offset, 0]}>{rib(0)}</group>
      <group position={[0, 0, offset]}>{rib(0)}</group>
      <group position={[0, 0, -offset]}>{rib(0)}</group>
    </group>
  );
}
