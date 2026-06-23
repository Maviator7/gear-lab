import * as THREE from 'three';
import type { TutorialHighlightStrength } from './types';

export const TUTORIAL_COLOR = new THREE.Color('#22d3ee');
export const POWER_COLOR = new THREE.Color('#f59e0b');
export const SYNC_COLOR = new THREE.Color('#f97316');

export function tutorialPulse(elapsedTime: number, strength: TutorialHighlightStrength = 'strong'): number {
  const base = strength === 'soft' ? 0.45 : 1.15;
  const wave = strength === 'soft' ? 0.12 : 0.25;
  return base + Math.sin(elapsedTime * 4) * wave;
}

export function applyTutorialEmissive(
  mat: THREE.MeshStandardMaterial | null,
  active: boolean,
  elapsedTime: number,
  strength: TutorialHighlightStrength = 'strong',
) {
  if (!mat) return;
  if (active) {
    mat.emissive.copy(TUTORIAL_COLOR);
    mat.emissiveIntensity = tutorialPulse(elapsedTime, strength);
    mat.toneMapped = false;
  } else {
    mat.emissive.setRGB(0, 0, 0);
    mat.emissiveIntensity = 0;
    mat.toneMapped = true;
  }
}
