# AGENTS.md

このファイルは、このリポジトリで作業するAIエージェント向けの共通ルールです。
対象範囲はリポジトリ全体です。

## プロジェクト概要

GearLab は、マニュアルトランスミッションの仕組みを 3D モデルとアニメーションで学ぶ教育用Webアプリです。

- Vite 6 / React 18 / TypeScript
- React Three Fiber / drei / Three.js
- Tailwind CSS
- Node.js 18系での動作を前提

現在の中心機能は、ギア選択、クラッチ操作、シンクロ機構、回転数表示です。
Phase3 ではチュートリアルモードを追加する計画があります。

関連ドキュメント:

- `README.md`
- `docs/DESIGN.md`
- `docs/DESIGN-PHASE2.md`
- `docs/superpowers/specs/2026-06-15-gearlab-phase3-tutorial-design.md`
- `docs/superpowers/plans/2026-06-15-gearlab-phase3-tutorial.md`

## ディレクトリ構造

```text
.
├── AGENTS.md
├── README.md
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── docs/
│   ├── DESIGN.md
│   ├── DESIGN-PHASE2.md
│   └── superpowers/
│       ├── specs/
│       └── plans/
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── index.css
    ├── types.ts
    ├── components/
    ├── data/
    └── hooks/
```

主要ディレクトリの責務:

- `src/components/`: 3D表示、操作パネル、説明パネルなどのReactコンポーネント。
- `src/data/`: ギア歯数、座標、ギア比、説明文などの静的データ。
- `src/hooks/`: 変速状態、シミュレーション更新、初期Sim生成などのロジック。
- `src/types.ts`: アプリ全体で共有する型定義。
- `docs/`: 設計書、仕様書、実装計画。
- `docs/superpowers/specs/`: 機能仕様。
- `docs/superpowers/plans/`: 実装計画。

Phase3実装時は、チュートリアル関連を `src/tutorial/` に分離して追加する予定です。

## よく使うコマンド

```bash
npm install
npm run dev
npm run build
npm run preview
```

テスト基盤を追加した後は、以下も使用します。

```bash
npm test
```

## 実装方針

- 既存の設計文書を先に確認し、歯数、座標、ギア比、符号規約を勝手に変えないこと。
- 3Dシミュレーションの単一情報源は `Sim` / `simRef` とし、`useFrame` 内ではReactの状態更新を避けること。
- Reactの状態更新は、離散イベントまたはUI操作を起点にすること。
- 既存の `useTransmissionState` はアプリ全体の状態オーナーなので、責務を分散させすぎないこと。
- Phase3のチュートリアル機能は、教材定義、進行判定、UIを分離して実装すること。
- 新しい挙動を追加するときは、可能な限り先にテストを追加し、失敗を確認してから実装すること。

## フロントエンドと3Dの注意

- UIは教育用シミュレーターとして落ち着いた工業調を維持すること。
- 操作パネル、3D表示、学習ガイドの可読性を優先すること。
- テキストがボタンやパネルからはみ出さないように、レスポンシブ幅を確認すること。
- 3Dの発光色には意味があるため、既存の色の優先順位を壊さないこと。
  - 失敗・警告: 赤
  - 動力伝達: アンバー
  - シンクロ作動: アンバー
  - 選択・チュートリアル強調: シアン
- Three.js / React Three Fiber の描画更新は、既存の可変refパターンに合わせること。

## Git運用

- ユーザーが明示的に依頼していない既存変更を戻さないこと。
- 作業前後に `git status --short --branch` を確認すること。
- `node_modules/`、`dist/`、ローカル作業ファイルはコミットしないこと。
- 複数の変更を混ぜず、意味のある単位でコミットすること。

## コミットメッセージ規約

コミットメッセージは必ず次の形式にしてください。

```text
<gitmoji> <接頭語>: <日本語の説明>
```

例:

```text
✨ feat: チュートリアルモードを追加
🐛 fix: クラッチ切断時の回転数表示を修正
📝 docs: Phase3の実装計画を追加
✅ test: チュートリアル進行判定のテストを追加
♻️ refactor: ギア表示の発光判定を分離
🎨 style: 操作パネルの余白を調整
🔧 chore: 開発用設定を更新
```

接頭語は原則として以下を使います。

- `feat`: 機能追加
- `fix`: 不具合修正
- `docs`: ドキュメント
- `test`: テスト
- `refactor`: 振る舞いを変えない整理
- `style`: 見た目や整形のみ
- `perf`: パフォーマンス改善
- `build`: ビルド・依存関係
- `ci`: CI設定
- `chore`: その他の保守作業

説明文は日本語で、何を変えたかが一目で分かる短い文にしてください。
