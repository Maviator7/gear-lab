// GrindEffect.tsx — ガリガリFX（PHASE2）。
//
// fxRef.grindId の変化を useFrame で検知し、grindGear のギア位置に約0.8秒のエフェクト:
//   (1) 対象ギアペア位置に赤emissiveの点滅リング(torus)
//   (2) 小さな火花パーティクル（10個の小boxが放射状に飛散して消える、毎フレーム位置・opacity更新）
//   (3) drei Html で小さな赤バッジ「ガリガリッ…」
//
// 工業シム調を保ち派手にしすぎない。Canvas内に1個配置。
// grindGear のギア位置は data/gears.ts から引く。null なら主軸中央付近。
// playing=false（凍結）時は時間を進めない＝FXも凍結（state.playing を props で受ける）。
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import type { FxState } from '../hooks/useTransmissionState';
import { GEARS, MAIN_Y } from '../data/gears';

const DURATION = 0.8;      // エフェクト総時間 [s]
const PARTICLE_COUNT = 10; // 火花数

interface Props {
  fxRef: MutableRefObject<FxState>;
  playing: boolean;
}

// 各火花の固定パラメータ（放射方向・速度）
interface Spark {
  dir: THREE.Vector3;
  speed: number;
}

export default function GrindEffect({ fxRef, playing }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const ringMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const sparkRefs = useRef<(THREE.Mesh | null)[]>([]);
  const prevId = useRef(fxRef.current.grindId);
  const elapsed = useRef(Infinity); // Infinity = 非アクティブ
  const center = useRef(new THREE.Vector3(0, MAIN_Y, 0));
  const [badge, setBadge] = useState(false);

  // 火花の方向ベクトル（YZ平面に放射状）を生成
  const sparks = useMemo<Spark[]>(() => {
    const out: Spark[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const a = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      out.push({
        dir: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          Math.sin(a),
          Math.cos(a),
        ).normalize(),
        speed: 1.4 + Math.random() * 1.2,
      });
    }
    return out;
  }, []);

  useFrame((_, rawDt) => {
    if (!playing) return; // 凍結に従う（時間を進めない）
    const dt = Math.min(rawDt, 0.05);
    const fx = fxRef.current;

    // grindId 変化を検知 → エフェクト開始
    if (fx.grindId !== prevId.current) {
      prevId.current = fx.grindId;
      elapsed.current = 0;
      // 位置決定: grindGear のギア位置（出力側ギア = MAIN_Y）。null は主軸中央付近。
      const spec = fx.grindGear ? GEARS.find((g) => g.id === fx.grindGear) : null;
      center.current.set(spec ? spec.x : 0, MAIN_Y, 0);
      if (groupRef.current) groupRef.current.position.copy(center.current);
      setBadge(true);
    }

    if (elapsed.current >= DURATION) {
      // 非アクティブ: 全て非表示
      if (ringMatRef.current) ringMatRef.current.opacity = 0;
      for (const m of sparkRefs.current) if (m) (m.material as THREE.MeshStandardMaterial).opacity = 0;
      if (badge) setBadge(false);
      return;
    }

    elapsed.current += dt;
    const t = elapsed.current / DURATION; // 0..1
    const fade = 1 - t;

    // (1) 点滅リング: opacity を高周波点滅 × フェードアウト、emissive 赤
    if (ringMatRef.current) {
      const blink = 0.5 + 0.5 * Math.sin(elapsed.current * 50);
      ringMatRef.current.opacity = fade * (0.4 + 0.6 * blink);
      ringMatRef.current.emissiveIntensity = 1.5 * fade * (0.4 + 0.6 * blink);
    }

    // (2) 火花: 放射状に飛散しつつフェード
    for (let i = 0; i < sparks.length; i++) {
      const mesh = sparkRefs.current[i];
      if (!mesh) continue;
      const s = sparks[i];
      const r = s.speed * elapsed.current; // 中心からの距離
      mesh.position.set(s.dir.x * r, s.dir.y * r, s.dir.z * r);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = fade;
      const sc = 0.06 * fade + 0.02;
      mesh.scale.setScalar(sc);
    }

    if (t >= 1 && badge) setBadge(false);
  });

  return (
    <group ref={groupRef} position={center.current}>
      {/* (1) 赤点滅リング */}
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.5, 0.04, 10, 28]} />
        <meshStandardMaterial
          ref={ringMatRef}
          color="#ef4444"
          emissive="#dc2626"
          emissiveIntensity={0}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* (2) 火花パーティクル */}
      {sparks.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => (sparkRefs.current[i] = m)}
          scale={0}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color="#fbbf24"
            emissive="#f59e0b"
            emissiveIntensity={2}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* (3) 赤バッジ */}
      {badge && (
        <Html position={[0, 0.75, 0]} center distanceFactor={12} zIndexRange={[20, 0]}>
          <div className="px-2 py-0.5 rounded bg-red-600/90 border border-red-400 text-red-50 text-[11px] font-bold whitespace-nowrap shadow-lg">
            ガリガリッ…
          </div>
        </Html>
      )}
    </group>
  );
}
