---
name: gearlab
description: GearLab project guidance for the manual-transmission 3D education app. Use when working in this repository on React, TypeScript, React Three Fiber animation, transmission simulation, tutorial mode, UI, tests, docs, or commits.
---

# GearLab Project Skill

このスキルは、GearLab リポジトリで作業するときのプロジェクト固有ガイドです。
詳細な運用ルールは `AGENTS.md` を先に確認してください。

## 最初に確認するもの

作業前に、必要な範囲で次を確認してください。

- `AGENTS.md`
- `README.md`
- `docs/DESIGN.md`
- `docs/DESIGN-PHASE2.md`
- Phase3作業なら `docs/superpowers/specs/2026-06-15-gearlab-phase3-tutorial-design.md`
- Phase3作業なら `docs/superpowers/plans/2026-06-15-gearlab-phase3-tutorial.md`

## 技術スタック

- Vite 6
- React 18
- TypeScript
- React Three Fiber / drei / Three.js
- Tailwind CSS
- Node.js 18系

## 重要な設計方針

- ギア歯数、座標、ギア比、符号規約は設計書なしに変更しない。
- 3Dシミュレーションは `Sim` / `simRef` を単一情報源にする。
- `useFrame` 内ではReact stateを毎フレーム更新しない。
- メッシュの回転、位置、material更新はref経由で直接行う。
- React state更新はUI操作、離散イベント、低頻度ポーリングを起点にする。
- `useTransmissionState` はアプリ全体の状態オーナーとして扱う。
- Phase3のチュートリアルは、教材定義、進行判定、UI、3Dハイライトを分離する。

## React Three Fiber作業

R3F作業では、必要に応じて `.agents/skills/` のスキルを参照してください。

- アニメーション: `.agents/skills/r3f-animation/SKILL.md`
- 基本構造: `.agents/skills/r3f-fundamentals/SKILL.md`
- ジオメトリ: `.agents/skills/r3f-geometry/SKILL.md`
- interaction: `.agents/skills/r3f-interaction/SKILL.md`
- material/発光: `.agents/skills/r3f-materials/SKILL.md`
- lighting: `.agents/skills/r3f-lighting/SKILL.md`

GearLabでは、まず `useFrame + ref + simRef` の既存パターンを優先してください。
新しいライブラリやspring animationは、既存パターンで表現できない理由がある場合だけ検討してください。

## よく使うコマンド

```bash
npm install
npm run dev
npm run build
npm run preview
```

テスト基盤追加後:

```bash
npm test
```

## 変更時の注意

- 既存のユーザー変更を勝手に戻さない。
- `node_modules/`、`dist/`、ローカル作業ファイルはコミットしない。
- UIは教育用シミュレーターとして落ち着いた工業調を保つ。
- ボタンやパネルの文字切れ、3D表示との重なりを確認する。
- 3D発光色の意味を保つ。
  - 赤: 失敗・警告
  - アンバー: 動力伝達・シンクロ作動
  - シアン: 選択・チュートリアル強調

## コミット

コミットメッセージは必ず次の形式にしてください。

```text
<gitmoji> <接頭語>: <日本語の説明>
```

例:

```text
✨ feat: チュートリアルモードを追加
🐛 fix: クラッチ切断時の回転数表示を修正
📝 docs: SKILLに作業ガイドを追加
✅ test: チュートリアル進行判定のテストを追加
🔧 chore: R3Fスキルを追加
```
