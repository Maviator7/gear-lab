// Gear.tsx — 歯付きギアメッシュ
//
// 歯形: THREE.Shape で台形歯を生成 → ExtrudeGeometry。
//   ピッチ半径 r = MODULE×teeth/2、歯先 r+m、歯元 r-1.25m、中心穴 半径0.18。
//   歯は台形（歯元幅0.45ピッチ角、歯先幅0.25ピッチ角）。小bevel。
// ジオメトリは「モジュールレベルのMapキャッシュ」(key: `${teeth}:${thickness}`) + useMemo で共有。
//
// 回転角・表示状態は useFrame で sim から取得し、material を直接更新（React再レンダー禁止）:
//   powered: amber emissive 0.6 / selected: cyan emissive 0.5 / free: opacity 0.45 / normal: opacity1 emissive0
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimRef, Sim } from '../types';
import { MODULE } from '../data/gears';

export type GearVisualMode = 'powered' | 'free' | 'selected' | 'normal';

interface Props {
  teeth: number;
  thickness?: number;
  color: string;
  position: [number, number, number];
  simRef: SimRef;
  getAngle: (sim: Sim) => number; // 回転角 (rad)
  visual: (sim: Sim) => GearVisualMode; // 表示状態
}

// ── モジュールレベルのジオメトリキャッシュ ──────────────────
const geometryCache = new Map<string, THREE.ExtrudeGeometry>();

function buildGearGeometry(teeth: number, thickness: number): THREE.ExtrudeGeometry {
  const key = `${teeth}:${thickness}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const r = (MODULE * teeth) / 2; // ピッチ半径
  const m = MODULE;
  const rTip = r + m; // 歯先
  const rRoot = r - 1.25 * m; // 歯元
  const pitchAngle = (Math.PI * 2) / teeth; // 1歯あたり角度

  // 台形歯: 歯元幅0.45ピッチ角、歯先幅0.25ピッチ角
  const rootHalf = pitchAngle * 0.45 * 0.5;
  const tipHalf = pitchAngle * 0.25 * 0.5;

  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const c = i * pitchAngle; // この歯の中心角
    // 歯の前後の谷（歯間）。1歯=「谷→歯元→歯先→歯先→歯元→谷」で輪郭を作る。
    const pts: [number, number][] = [
      [Math.cos(c - rootHalf) * rRoot, Math.sin(c - rootHalf) * rRoot],
      [Math.cos(c - tipHalf) * rTip, Math.sin(c - tipHalf) * rTip],
      [Math.cos(c + tipHalf) * rTip, Math.sin(c + tipHalf) * rTip],
      [Math.cos(c + rootHalf) * rRoot, Math.sin(c + rootHalf) * rRoot],
    ];
    if (i === 0) shape.moveTo(pts[0][0], pts[0][1]);
    else shape.lineTo(pts[0][0], pts[0][1]);
    shape.lineTo(pts[1][0], pts[1][1]);
    shape.lineTo(pts[2][0], pts[2][1]);
    shape.lineTo(pts[3][0], pts[3][1]);
  }
  shape.closePath();

  // 中心穴
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.18, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: m * 0.4,
    bevelSize: m * 0.3,
    bevelSegments: 1,
    steps: 1,
  });
  // 押し出し方向(Z)を厚み中央に合わせ、軸(+X)に直交させるため X軸まわり90°回す
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(Math.PI / 2); // 押し出し軸 Z → X
  geo.computeVertexNormals();

  geometryCache.set(key, geo);
  return geo;
}

const COLOR_POWERED = new THREE.Color('#f59e0b'); // amber
const COLOR_SELECTED = new THREE.Color('#22d3ee'); // cyan

export default function Gear({
  teeth,
  thickness = 0.5,
  color,
  position,
  simRef,
  getAngle,
  visual,
}: Props) {
  const geometry = useMemo(() => buildGearGeometry(teeth, thickness), [teeth, thickness]);
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    const sim = simRef.current;
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    // 回転角を直接書き換え（軸 +X まわり）
    mesh.rotation.x = getAngle(sim);

    // 表示状態に応じて material を直接更新
    const mode = visual(sim);
    switch (mode) {
      case 'powered':
        mat.emissive.copy(COLOR_POWERED);
        mat.emissiveIntensity = 0.6;
        mat.opacity = 1;
        mat.transparent = false;
        break;
      case 'selected':
        mat.emissive.copy(COLOR_SELECTED);
        mat.emissiveIntensity = 0.5;
        mat.opacity = 1;
        mat.transparent = false;
        break;
      case 'free':
        mat.emissive.setRGB(0, 0, 0);
        mat.emissiveIntensity = 0;
        mat.opacity = 0.45;
        mat.transparent = true;
        break;
      default: // normal
        mat.emissive.setRGB(0, 0, 0);
        mat.emissiveIntensity = 0;
        mat.opacity = 1;
        mat.transparent = false;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} position={position} castShadow receiveShadow>
      <meshStandardMaterial
        ref={matRef}
        color={color}
        metalness={0.7}
        roughness={0.35}
      />
    </mesh>
  );
}
