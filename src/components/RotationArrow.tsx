// RotationArrow.tsx — 回転方向矢印（半トーラス + 先端コーン、軸と共回転）
//
// 軸周りの半トーラス(r=軸半径+0.25, tube 0.03) + 先端コーン。
// rotation.x = 対象角度 で共回転させる（回転方向が直感的に見える）。
// |実rpm| に応じて opacity 0〜0.9（|rpm|<30 で透明）。色は emissive な明るい緑。
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimRef, Sim } from '../types';

interface Props {
  position: [number, number, number];
  baseRadius: number; // 対象軸の半径
  simRef: SimRef;
  getAngle: (sim: Sim) => number;
  getRpm: (sim: Sim) => number; // 符号付き実RPM（|値|で不透明度、符号で向き）
}

const ARROW_COLOR = '#4ade80'; // 明るい緑

export default function RotationArrow({
  position,
  baseRadius,
  simRef,
  getAngle,
  getRpm,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const torusMat = useRef<THREE.MeshStandardMaterial>(null);
  const coneMat = useRef<THREE.MeshStandardMaterial>(null);
  const r = baseRadius + 0.25;

  useFrame(() => {
    const sim = simRef.current;
    const g = groupRef.current;
    if (!g) return;

    g.rotation.x = getAngle(sim); // 対象と共回転

    const rpm = getRpm(sim);
    // |rpm|<30 で透明、以降 線形に 0.9 まで（300rpmで飽和）
    const mag = Math.abs(rpm);
    let op = 0;
    if (mag > 30) op = Math.min(0.9, ((mag - 30) / 270) * 0.9);
    // 回転の符号で矢印の向き（Z反転）を切替え、進行方向を直感的に
    g.scale.z = rpm >= 0 ? 1 : -1;

    if (torusMat.current) {
      torusMat.current.opacity = op;
      torusMat.current.transparent = true;
    }
    if (coneMat.current) {
      coneMat.current.opacity = op;
      coneMat.current.transparent = true;
    }
  });

  // 弧の張り角。torus は XY平面（穴軸=Z）に生成されるため、
  // Ry(90°) で穴軸を X に向ける（弧上の点 (cosφ, sinφ, 0) → (0, sinφ, -cosφ)）。
  const ARC = Math.PI * 1.3;
  return (
    <group ref={groupRef} position={position}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[r, 0.03, 8, 24, ARC]} />
        <meshStandardMaterial
          ref={torusMat}
          color={ARROW_COLOR}
          emissive={ARROW_COLOR}
          emissiveIntensity={1.2}
          transparent
          opacity={0}
        />
      </mesh>
      {/* 先端コーン: 弧端 (0, sin(ARC), -cos(ARC))·r は Rx(ARC - π/2) でローカル+Y位置に一致。
          その座標系ではローカル+Zが弧の接線（+X正回転の進行方向）なので、
          コーン（先端+Y生成）を Rx(90°) して +Z へ向ける。 */}
      <group rotation={[ARC - Math.PI / 2, 0, 0]}>
        <mesh position={[0, r, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.07, 0.18, 12]} />
          <meshStandardMaterial
            ref={coneMat}
            color={ARROW_COLOR}
            emissive={ARROW_COLOR}
            emissiveIntensity={1.2}
            transparent
            opacity={0}
          />
        </mesh>
      </group>
    </group>
  );
}
