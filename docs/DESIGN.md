# MT Gearbox Visualizer — 設計書（実装契約）

教育用マニュアルトランスミッション3D可視化アプリ。実装者はこの契約に**厳密に**従うこと。
数値（歯数・座標・比率）は幾何的整合性のため変更禁止。

## 技術スタック（Node 18 制約あり — バージョン厳守）

- Vite 6 / React 18.3 / TypeScript
- three@^0.170 / @react-three/fiber@^8.17 / @react-three/drei@^9.114 / @types/three@^0.170
- tailwindcss@^3.4（PostCSS方式。v4はNode20+要求のため禁止）
- UIテキストはすべて日本語

## ディレクトリ構成

```
src/
  types.ts                 # 共有型（本書の定義をそのまま使用）
  components/
    GearboxScene.tsx       # Canvas内ルート。ライト、OrbitControls、全パーツ配置
    Gear.tsx               # 歯付きギアメッシュ（ExtrudeGeometry、メモ化）
    Shaft.tsx              # 軸（円柱）
    Clutch.tsx             # フライホイール+クラッチディスク（開閉アニメ）
    Synchronizer.tsx       # ハブ+スリーブ+シンクロリング（スライド+発光）
    ShiftFork.tsx          # シフトフォーク（スリーブに追従）
    RotationArrow.tsx      # 回転方向矢印（半トーラス+コーン、軸と共回転）
    ControlPanel.tsx       # ギアボタン(H型配置)、クラッチ、RPM、再生、モード
    ExplanationPanel.tsx   # 右側解説パネル
  data/
    gears.ts               # 下記の数値データ
    explanations.ts        # 日本語解説テキスト
  hooks/
    useGearboxAnimation.ts # シミュレーション本体（状態機械）
  App.tsx
  main.tsx
  index.css
```

## 共有型 — src/types.ts（このまま実装）

```ts
import type { MutableRefObject } from 'react';

export type GearPosition = 'N' | '1' | '2' | '3' | '4' | '5' | 'R';
export type GearId = Exclude<GearPosition, 'N'>;
export type HubId = 'h12' | 'h34' | 'h5R';
export type ViewMode = 'beginner' | 'detail';
export type ShiftPhase = 'idle' | 'disengage' | 'synchro' | 'engage';

export interface GearPairSpec {
  id: GearId;
  label: string;          // 例 "1速"
  counterTeeth: number;   // カウンターシャフト側歯数
  outputTeeth: number;    // 出力軸側歯数
  idlerTeeth?: number;    // リバースのみ（アイドルギア）
  x: number;              // 軸方向位置
  hub: HubId;             // 担当シンクロハブ
  hubSide: -1 | 1;        // ハブから見てギアが -1=左(x小) / 1=右(x大)
  totalRatio: number;     // 常時噛合段含む総減速比（表示用、Rは正値で別途「逆転」表示）
}

export interface GearboxState {
  selectedGear: GearPosition;
  clutchEngaged: boolean;  // true = クラッチ接続（ペダルを踏んでいない）
  rpm: number;             // エンジン回転数 600–3000
  playing: boolean;
  mode: ViewMode;
}

/** 毎フレーム useGearboxAnimation が書き換える可変オブジェクト（参照は不変） */
export interface Sim {
  angles: {
    input: number; counter: number; output: number; idler: number;
    gears: Record<GearId, number>;     // 各出力側ギアの回転角（常時噛合なので常に回る）
  };
  speeds: { input: number; counter: number; output: number }; // 視覚 rad/s（符号付き）
  sleeves: Record<HubId, number>;      // スリーブ位置 -1..0..1（hubSide方向）
  synchroGlow: Record<HubId, number>;  // 0..1 シンクロ作動発光
  clutchGap: number;                   // 0=接続 .. 1=切断（ディスク間隙間）
  lockedGear: GearPosition;            // 実際にロック中のギア（シフト中はselectedと異なる）
  phase: ShiftPhase;
  powerFlow: boolean;                  // 出力軸まで動力が流れているか
  rpms: { engine: number; input: number; counter: number; output: number }; // 実RPM表示用
}

export type SimRef = MutableRefObject<Sim>;
```

## ギアデータ — src/data/gears.ts

モジュール `MODULE = 0.08`（ピッチ半径 r = MODULE * 歯数 / 2）。
**前進全ペアの歯数和は50**（軸間距離 2.0 を共有するため。変更禁止）。
**Rペアのみ歯数和42**: 半径和 1.68 < 軸間 2.0 で直接は噛み合わず、隙間をアイドラー(18T)が橋渡しする。
（歯数和50にするとRペアが直接接触してしまい、アイドラーによる逆転の教育的要点が崩れる。）

```ts
export const MODULE = 0.08;
export const MAIN_Y = 1.0;     // 入力軸・出力軸（同軸）の y
export const COUNTER_Y = -1.0; // カウンターシャフトの y
// 常時噛合段（入力軸→カウンター）: 入力21T / カウンター29T, x = -3.4
export const CONSTANT_MESH = { inputTeeth: 21, counterTeeth: 29, x: -3.4 };
// リバースアイドルギア 18T。位置（幾何計算済み・変更禁止）:
export const IDLER = { teeth: 18, x: 4.7, y: -0.5616, z: 1.117 };
```

| id | counterTeeth | outputTeeth | x | hub | hubSide | totalRatio |
|----|----|----|------|------|----|------|
| 1  | 14 | 36 | -1.9 | h12 | -1 | 3.55 |
| 2  | 20 | 30 | -0.6 | h12 |  1 | 2.07 |
| 3  | 25 | 25 |  0.7 | h34 | -1 | 1.38 |
| 4  | 29 | 21 |  2.0 | h34 |  1 | 1.00 |
| 5  | 32 | 18 |  3.3 | h5R | -1 | 0.78 |
| R  | 12 | 30 |  4.7 | h5R |  1 | 3.45 |

ハブ位置: `HUBS = { h12: -1.25, h34: 1.35, h5R: 4.0 }`（x座標、出力軸上）。
スリーブ移動量: `SLEEVE_TRAVEL = 0.42`。
軸範囲: 入力軸 x∈[-5.3, -3.0]、出力軸 x∈[-3.0, 5.6]、カウンター x∈[-3.9, 5.2]。
クラッチ: x = -4.6 付近（フライホイール+ディスク）。エンジンブロック（箱）x < -5.3。

## 回転の符号規約（変更禁止 — ここを間違えると教育的に破綻する）

回転軸は +X。`group.rotation.x = angle`。外歯車の噛み合いは回転反転。

```
counterΩ = -inputΩ * (21 / 29)
前進ギアi: gearΩ_i = -counterΩ * (counterTeeth_i / outputTeeth_i)   // → 入力と同方向
リバース:  idlerΩ  = -counterΩ * (12 / 18)
          gearΩ_R = -idlerΩ  * (18 / 30)                            // → 入力と逆方向
outputΩ = lockedGear !== 'N' ? gearΩ_locked : 慣性減衰
```

視覚スロー再生係数 `VISUAL_SCALE = (2π/60) * 0.05`（rpm→視覚rad/s、1/20スロー）。
表示用実RPMは比率から計算（スロー係数を掛けない値）。

## アニメーション状態機械 — useGearboxAnimation

`useGearboxAnimation(state: GearboxState, onPhaseChange?: (p: ShiftPhase) => void): SimRef`

- フック内部に `useRef<Sim>` を1つ持ち、`useFrame` で毎フレーム書き換える（再レンダーしない）。
- `onPhaseChange` はフェーズが**変化した時のみ**呼ぶ（setStateコスト対策）。
- dt は 0.05 にクランプ。`state.playing === false` のとき時間停止（角度を進めない）。

### 速度モデル（毎フレーム）

```
targetEngine = rpm * VISUAL_SCALE
effectiveClutch = state.clutchEngaged && autoClutchClosed   // シフト自動クラッチ
inputΩ  → 一次遅れで (effectiveClutch ? targetEngine : 0) に接近
           時定数: 接続時 τ=0.25s、切断時 τ=1.5s（惰性で緩やかに停止）
counterΩ = 上記符号規約。ただし synchro フェーズ中は特例（下記）
outputΩ  = ロック中: gearΩ_locked。N: τ=6s で 0 へ減衰（車体慣性の表現）
```

### シフトシーケンス（selectedGear が lockedGear と異なるのを検知して開始）

1. **disengage** (0.35s): 自動クラッチ切断（clutchGap→1）。現ハブのスリーブ→0。終了時 lockedGear='N' 扱い。
2. **synchro** (0.7s): 目標が'N'ならスキップ。目標スリーブを hubSide×0.6 まで移動、`synchroGlow→1`。
   **この間、counterΩ を「目標ギアの速度が outputΩ と一致する値」へ補間**（= シンクロが回転を合わせる表現の本体）:
   `counterΩ_target = -outputΩ * (outputTeeth / counterTeeth)`（リバースは符号1回追加）。
3. **engage** (0.35s): スリーブ→hubSide×1.0、glow減衰、lockedGear=目標。
4. 自動クラッチ再接続（0.4sで clutchGap→ユーザー設定値）。phase='idle'。

シフト中に再度ギア変更されたら、現フェーズを中断して disengage からやり直し。
`powerFlow = effectiveClutch がほぼ閉 && lockedGear !== 'N' && playing`。

### 角度積分

全要素 `angle += Ω * dt`。各ギアは**常時噛合**（ロックの有無に関わらず counter から導出した速度で回る）。
噛み合い位相: 出力側ギアとアイドラーには初期角 `π / 歯数`（半ピッチずらし）を与える。

## 3D表現契約

- **Gear.tsx**: props `{ teeth, module?, thickness?, color, simKey..., }` 等は実装裁量。ただし:
  - THREE.Shape で歯形生成: ピッチ半径 r、歯先 r+m、歯元 r−1.25m。歯は台形（歯元幅0.45ピッチ角、歯先幅0.25ピッチ角）。中心穴 半径0.18。ExtrudeGeometry depth=0.5(可変)、小bevel。`useMemo` で歯数ごとにキャッシュ。
  - 状態着色: 動力伝達中=emissive強調(amber系)、空転=opacity 0.45 transparent、選択中ギア=別色(cyan系)。`useFrame` で sim を読み material を直接書き換え（React再レンダー禁止）。
- **Synchronizer.tsx**: ハブ（固定リング）+ スリーブ（軸方向スライド、sim.sleeves×SLEEVE_TRAVEL×hubSide）+ 両側シンクロリング（細トーラス、sim.synchroGlow で emissiveIntensity 0→3、色はorange）。
- **ShiftFork.tsx**: U字型（トーラス半分+柄）。スリーブのx位置に追従。担当ハブのシフト中は色変化。
- **Clutch.tsx**: フライホイール円盤（エンジン側、inputと独立にengine速度で回転…簡略化として「エンジン側ディスクはengineΩで回転、入力側ディスクはinputΩで回転」、clutchGapでx方向に離間 0→0.25）。
- **RotationArrow.tsx**: 半円トーラス+circleコーン。`rotation.x = 対象angle` で共回転（方向が直感的に見える）。|Ω|<0.05で非表示(opacity 0)。入力軸・カウンター・出力軸・アイドラーに設置。
- **ラベル**: drei `<Html>`。beginnerモード: 部品名（エンジン/クラッチ/入力軸/カウンターシャフト/出力軸/シンクロ/アイドルギア）。detailモード: 歯数表示 + 各軸RPM。
- カメラ初期位置 `[6, 4, 9]`、`<OrbitControls makeDefault enableDamping />`。背景 #0b1020系。ライト: ambient 0.5 + directional 2灯。`<Canvas shadows dpr={[1, 2]}>`。

## UI契約

- **App.tsx**: `useState` で GearboxState 一式 + shiftPhase。左に Canvas(flex-1)、右に固定幅384pxパネル（ExplanationPanel上・ControlPanel下、スクロール可）。ヘッダにタイトル。
- **ControlPanel**: ギアボタンはシフトレバーH型グリッド配置（R位置は右下、Nは中央バー）。選択中=cyan、ロック反映待ち（シフト中）=点滅。クラッチトグル（大きめスイッチ、「クラッチ接続/切断」）、RPMスライダー(600–3000, step50, 現在値表示)、再生/一時停止、モード切替（初心者/詳細）セグメント。
- **ExplanationPanel**: explanations.ts から selectedGear・mode・shiftPhase・clutch状態に応じた解説。ギア比バッジ（例「ギア比 3.55 : 1」、Rは「逆転」バッジ追加）、トルク/速度バー（ratio正規化、1速=トルク最大）、detailモードでは歯数式 `(29/21)×(36/14)` と各軸RPMを表示。シフト中はフェーズ説明（「シンクロナイザーが回転速度を合わせています…」等）を強調表示。
- 配色: ダークUI（slate-900系背景、パネルslate-800、アクセントcyan-400/amber-400）。

## explanations.ts 内容方針

各ギア×(beginner/detail)の解説。beginnerは比喩中心（1速=自転車の軽いギア等）、detailはトルク増幅・回転数・常時噛合・ドグクラッチの仕組み。Neutral=「全ギアは回っているがどれも出力軸に固定されていない」、Reverse=「アイドルギアが間に入り回転方向が反転」を必ず含む。クラッチ切断時の文、各シフトフェーズの文も定義。
