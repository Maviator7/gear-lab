# PHASE2 設計書 — クラッチ/シンクロ体験シミュレーター（実装契約）

PHASE1（docs/DESIGN.md）の上に構築する。PHASE1の符号規約・歯数・座標・Simパターンは不変。
本書の型・定数・遷移規則は厳守（変更禁止）。

## コンセプト

- **初心者モード**: 現行どおり。ボタンを押すだけで自動シフト（自動クラッチ）。必ず成功。
- **詳細モード**: 手動MT体験。クラッチを切らないと変速拒否。シンクロ一致率が100%に達した時のみ係合。
  エンジン回転数を合わせる（レブマッチ）と同期が速く確実になる。失敗あり。

## 状態機械 — src/hooks/useTransmissionState.ts（新規）

```ts
export enum TransmissionState {
  NEUTRAL = 'NEUTRAL',                     // ギア未係合・クラッチ接続
  CLUTCH_DISENGAGED = 'CLUTCH_DISENGAGED', // クラッチ切断（変速準備OK）
  SYNCHRONIZING = 'SYNCHRONIZING',         // スリーブ押付・回転同期中
  READY_TO_ENGAGE = 'READY_TO_ENGAGE',     // 同期完了・ドグ係合中（遷移的）
  ENGAGED = 'ENGAGED',                     // ギア係合済み
  SHIFT_FAILED = 'SHIFT_FAILED',           // 変速失敗（2.5sの過渡表示）
}

export type FailReason = 'clutchEngaged' | 'syncTimeout' | 'clutchDuringSync';

export interface Warning {
  kind: FailReason;
  lines: string[]; // 例 ['⚠ ギアが入りません', '⚠ クラッチを切ってください']
}

/** sim(フレームループ) → React への離散イベント */
export type TransmissionEvent =
  | { type: 'synchroStart'; gear: GearId }
  | { type: 'syncReady' }                          // 同期100%到達、ドグ係合開始
  | { type: 'engaged'; gear: GearPosition }        // 係合完了（'N'含む）
  | { type: 'shiftFailed'; reason: 'syncTimeout' | 'clutchDuringSync' };

export interface Telemetry {
  currentRpm: number;        // 入力軸RPM（現在ギア回転数）
  outputRpm: number;         // 出力軸RPM
  targetRpm: number | null;  // 目標入力軸RPM（=同期に必要な値）。対象ギアなしは null
  diffRpm: number | null;    // |current - target|
  syncRate: number;          // 0..1（表示は%）
}

/** FXチャネル（React→Canvas、可変refで伝達） */
export interface FxState {
  grindId: number;           // インクリメントで発火通知
  grindGear: GearId | null;  // エフェクト位置のギア
}
```

`useTransmissionState()` は **App の全状態のオーナー**になる。返り値契約:

```ts
export function useTransmissionState(): {
  state: GearboxState;                  // selectedGear/clutchEngaged/rpm/playing/mode
  tState: TransmissionState;
  warning: Warning | null;              // 表示中の警告（自動クリア）
  telemetry: Telemetry;                 // 100ms間隔ポーリング（setInterval）で更新
  simRef: SimRef;                       // ここで createInitialSim() して保持。Sceneへ渡す
  fxRef: MutableRefObject<FxState>;
  requestShift: (g: GearPosition) => void;
  toggleClutch: () => void;
  setRpm: (rpm: number) => void;
  togglePlay: () => void;
  toggleMode: () => void;
  handleSimEvent: (e: TransmissionEvent) => void;  // Sceneの onEvent に配線
}
```

### requestShift の検証規則（詳細モードのみ。初心者モードは常に受理）

1. `g === state.selectedGear` → 無視。
2. `state.clutchEngaged === true` → **拒否**: selectedGear は変えない。
   tState=SHIFT_FAILED（2.5s後に自動復帰）、warning = ['⚠ ギアが入りません', '⚠ クラッチを切ってください']、
   fxRef を bump（grindGear = 対象ギア。g==='N' なら現ロックギア、それもなければ FXなし）。
3. クラッチ切断中 → 受理: selectedGear = g（simが検知してシーケンス開始）。

### イベント処理（handleSimEvent）

- `shiftFailed(syncTimeout)` → selectedGear='N' に戻す、tState=SHIFT_FAILED(2.5s)、
  warning=['⚠ ギアが入りません', '⚠ 回転差が大きすぎます']、fx bump。
- `shiftFailed(clutchDuringSync)` → 同上、warning=['⚠ ギアが入りません', '⚠ シンクロ中にクラッチが接続されました']。
- `engaged` / `synchroStart` / `syncReady` → tState 更新。
- SHIFT_FAILED の復帰先: clutchEngaged ? (locked!=N ? ENGAGED : NEUTRAL) : CLUTCH_DISENGAGED。

### tState の導出（イベント駆動 + 整合化）

イベントで主遷移。加えて clutch トグル時に即時再導出:
クラッチ切→ CLUTCH_DISENGAGED（シフト中でなければ）。クラッチ接続→ ENGAGED or NEUTRAL。
SHIFT_FAILED 表示中はタイマー優先。

## 物理モデル拡張 — useGearboxAnimation（改修）

シグネチャ: `useGearboxAnimation(simRef: SimRef, state: GearboxState, onEvent?: (e: TransmissionEvent) => void): void`
（simRef は外部=useTransmissionState が生成。makeInitialSim は `createInitialSim` として
`src/hooks/simInitial.ts`（新規、R3F非依存）へ移し、フックと useTransmissionState 双方から import。）

### 定数（検算済み・変更禁止）

```ts
const TAU_DRAG = 8.0;    // 詳細モード: クラッチ切断中、入力軸がエンジンΩへ弱く引かれる（クラッチドラッグ）
const TAU_SYNC = 0.5;    // シンクロ押付中: 入力軸が同期目標Ωへ強く引かれる
const ENGAGE_DOG_DIFF = 30;   // 係合可能なドグ回転差 [rpm, ギア側実RPM]
const ENGAGE_SUSTAIN = 0.3;   // 上記を維持すべき秒数
const SYNC_WINDOW = 400;      // 一致率表示の正規化幅 [rpm]
const T_SYNC_MAX = 4.0;       // 同期タイムアウト → shiftFailed(syncTimeout)
const FAIL_RETRACT = 0.3;     // 失敗時スリーブ後退秒数
```

- dogDiff = |gearRpm_target − outputRpm|（両方とも主軸上の実RPM。gearRpm は常時噛合から導出）。
- `syncRate = clamp((SYNC_WINDOW − dogDiff) / (SYNC_WINDOW − ENGAGE_DOG_DIFF), 0, 1)`
  （dogDiff ≤ 30 でちょうど 1.0。dogDiff ≥ 400 で 0）。
- 係合条件: dogDiff ≤ ENGAGE_DOG_DIFF が ENGAGE_SUSTAIN 連続 → syncReady → スリーブ1.0(0.25s) → engaged。

### 入力軸速度則（モード分岐）

```
初心者モード: PHASE1どおり（自動クラッチ、synchroフェーズ中はτ=0.2で強制収束、必ず成功）
詳細モード:
  クラッチ接続時:    inputΩ → engineΩ (τ=0.25)   ※PHASE1と同じ
  クラッチ切断時:    dω = (engineΩ − ω)/TAU_DRAG · dt          … 常時（ドラッグ）
  ＋シンクロ押付中:  dω += (matchΩ − ω)/TAU_SYNC · dt           … 加算（二重引き込み）
  matchΩ = 目標ギアの dog が outputΩ に一致する inputΩ（PHASE1の synchro 特例と同式）
```

明示オイラー積分で安定（最大レート 1/0.5+1/8 = 2.125/s、dt≤0.05 → 係数0.106 ≪ 1）。

**運動学の主従（詳細モード・クラッチ切断時）**:
- lockedGear ≠ 'N'（ギアが入ったままクラッチ切断）: **出力軸が主**。outputΩ は車体慣性として τ=6s で緩減衰し、
  inputΩ はギア比から逆算した従属値（ドラッグ則は適用しない。車体慣性 ≫ クラッチドラッグのため）。
  → 走行中にクラッチを切ってもすぐには減速しない＝惰性走行が見える。
- lockedGear === 'N': **入力側が自由**。上記のドラッグ＋シンクロ二重引き込み則を適用。outputΩ は τ=6s 減衰。
- 初心者モードは PHASE1 の規則を一切変更しない（クラッチ切断時 input→0, τ=1.5）。

**教育的成立性（この定数の根拠・検算済み）**:
平衡 inputΩ ≈ (matchΩ/τs + engineΩ/τd)/(1/τs + 1/τd) → 平衡dogDiff ≈ |engine−match|×0.0588×k_gear。
- 2→3速アップシフト（エンジン1800放置）: 平衡diff≈26rpm<30 → 成功（アップシフトは楽）
- 3→2速ダウンシフト（エンジン1200のまま→eq diff≈17 成功 / 600に下げると≈34 失敗）→ ブリッピングを学ぶ
- 停車N→1速: エンジン1200→diff≈20 成功 / 2000→33 失敗 →「発進はアイドリング付近」を学ぶ

### 詳細モードのシフトシーケンス（selectedGear変化で開始。検証は上流済み）

```
moveOut(0.35s): 全スリーブ→0、lockedGear='N'
  ↓ 目標'N'ならここで engaged('N') を発火して終了
press(0.25s): 目標スリーブ→hubSide×0.6、glow→1、synchroStart発火
sync(可変, ≤T_SYNC_MAX): 二重引き込み。dogDiff≤30が0.3s継続 → syncReady発火
  ├─ タイムアウト → shiftFailed(syncTimeout)発火、スリーブ後退(0.3s)、glow減衰、シーケンス終了
  └─ クラッチ接続された → shiftFailed(clutchDuringSync)発火、同上
engage(0.25s): スリーブ→hubSide×1.0、lockedGear=目標、engaged発火
```

- 詳細モードに自動クラッチは**存在しない**（autoClutchClosed は常にtrue扱い。clutchGapはユーザー操作のみ）。
- シフト中の再 requestShift は受理されたら現シーケンス中断 → moveOut からやり直し（PHASE1と同様）。
- 初心者モードは PHASE1 シーケンスを維持しつつ、対応する TransmissionEvent を発火する
  （disengage開始時は発火不要、synchro開始=synchroStart、engage開始=syncReady、完了=engaged）。

### Sim 拡張（types.ts に追記）

```ts
// Sim に追加するフィールド
syncRate: number;                 // 0..1
targetGear: GearPosition;         // シフトシーケンスの目標（なければ 'N' でなく lockedGear と同値でよい）
telemetry: { currentRpm: number; outputRpm: number; targetRpm: number | null; diffRpm: number | null };
```

telemetry は sim が毎フレーム書く（単一情報源）。useTransmissionState は100msでこれを読んで setState。
targetRpm: シフト中=目標ギアの matchΩ を実RPM化。非シフト中でギア係合済み=現在値(diff=0)。N かつ非シフト=null。
初心者モードでも全フィールドを埋める（パネルは両モードで表示するため）。

## 3D表現追加

- **GrindEffect.tsx（新規）**: fxRef.grindId の変化を useFrame で検知し、grindGear のギア位置に
  約0.8秒のエフェクト: (1)対象ギアペア位置に赤emissiveの点滅リング(torus)、(2)小さな火花パーティクル
  （8〜12個の小さなtetrahedron/boxが放射状に飛散して消える、毎フレーム位置・opacity更新）、
  (3) drei Html で小さな赤バッジ「ガリガリッ…」を表示。工業シム調を保ち、派手にしすぎない。
  Canvas内に1個配置し、ギア位置は data/gears.ts から引く（grindGear=null なら主軸中央付近）。
- **シフト中のスリーブ微振動**: 詳細モードの sync 中、dogDiff が大きい間（syncRate<0.5）は
  スリーブ x に ±0.01 の高周波ジッタを加える（噛めない感の表現。Synchronizer.tsx で sim から判定）。

## UI 拡張（ExplanationPanel / ControlPanel / explanations.ts）

- **警告バナー**: warning非null時、パネル最上部に赤系（bg-red-950/border-red-600）バナーで
  warning.lines を縦に表示。2.5sで自動消滅（tStateと同期）。
- **状態インジケータ**: TransmissionState を日本語ラベル+色チップで常時表示
  （NEUTRAL=slate/ニュートラル、CLUTCH_DISENGAGED=blue/クラッチ切断中、SYNCHRONIZING=amber/同期中、
  READY_TO_ENGAGE=lime/係合中、ENGAGED=green/係合済み、SHIFT_FAILED=red/変速失敗）。
- **シンクロ一致率ゲージ**: 横バー+大きめ%数値。100%で緑、それ未満はamber→赤のグラデ。
  シフト非実行中は「—」表示（バー0）。
- **回転数パネル（両モード表示）**: 4行テーブル: 現在ギア回転数(=入力軸)/出力軸回転数/目標回転数/回転差。
  telemetry から表示。target=null は「—」。diff は大きいほど赤、小さいほど緑の文字色。
- **動力伝達ライン図**: パネル内に横並びスキマティック
  `エンジン ─ クラッチ ─ ギアボックス ─ 出力軸`（divとボーダーで簡潔に）。
  セグメント色: エンジン→クラッチ: 常に緑(エンジン回転中)。クラッチ→ギアボックス: clutchEngaged ? 緑 : 灰色
  + 「切断」ラベル。ギアボックス→出力軸: lockedGear!=='N' ? 緑 : 灰色。
  クラッチ切断中は「エンジン: 回転継続 / 出力軸: 動力なし」の注記を表示。
- **教育テキスト（feature 7）**: explanations.ts に `TRANSMISSION_STATE_TEXT: Record<TransmissionState, string>`
  を追加（例: CLUTCH_DISENGAGED=「クラッチを切るとエンジンとトランスミッションが分離されます。…」、
  SYNCHRONIZING=「シンクロナイザーが回転数を合わせています。回転差が無くなるとドッグクラッチが接続されます」、
  SHIFT_FAILED=「回転差が大きいためギアが入りません。クラッチを切り、回転数を合わせてください」等）。
  詳細モードでは状態テキストを既存ギア解説より優先表示。初心者モードは既存解説主体+状態チップ。
- **ControlPanel**: RPMスライダー max = mode==='detail' ? 6000 : 3000（detail→beginner切替時 3000 にクランプ）。
  詳細モードではクラッチボタンを大型化・強調し、クラッチ接続中にシフターの周囲へ
  小さく「変速にはクラッチ切断が必要」とヒント表示。
- ダークテーマ・工業シム調維持。ゲーム的演出（スコア・派手なエフェクト）禁止。

## 配線（App.tsx）

```tsx
const tm = useTransmissionState();
<GearboxScene state={tm.state} simRef={tm.simRef} fxRef={tm.fxRef} onEvent={tm.handleSimEvent} />
<ExplanationPanel state={tm.state} tState={tm.tState} warning={tm.warning} telemetry={tm.telemetry} />
<ControlPanel state={tm.state} tState={tm.tState} onGearSelect={tm.requestShift} ... />
```

旧 `shiftPhase`/`onPhaseChange` は廃止（sim内部のメカフェーズは残してよいが React へは TransmissionEvent のみ）。

## 受け入れ基準（監査で検証する）

1. 初心者モード: PHASE1 と同じ操作感（ボタンだけで変速、必ず成功）。
2. 詳細モード・クラッチ接続中にギアボタン → 変速されず、赤警告2種 + ギア付近にガリガリFX。
3. 詳細モード・クラッチ切断→ギア選択 → 同期%が上昇し、100%でドグ係合、クラッチ再接続で動力伝達。
4. 3→2ダウンシフトでエンジン600のままだと syncTimeout 失敗。1800付近に合わせると成功。
5. 一時停止中は全シーケンス凍結（PHASE1踏襲）。
6. `npm run build` エラーゼロ。
