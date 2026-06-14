import type { GearboxState, GearPosition, ShiftPhase } from '../types';

interface Props {
  state: GearboxState;
  shiftPhase: ShiftPhase;
  onGearSelect: (g: GearPosition) => void;
  onClutchToggle: () => void;
  onRpmChange: (rpm: number) => void;
  onPlayToggle: () => void;
  onModeToggle: () => void;
}

// H型シフトパターンのグリッドレイアウト
// 列: 左(0)・中(1)・右(2)  行: 上(0)・中(1)・下(2)
// [col, row]
const GEAR_POSITIONS: { gear: GearPosition; label: string; col: number; row: number }[] = [
  { gear: '1', label: '1',  col: 0, row: 0 },
  { gear: '3', label: '3',  col: 1, row: 0 },
  { gear: '5', label: '5',  col: 2, row: 0 },
  { gear: '2', label: '2',  col: 0, row: 2 },
  { gear: '4', label: '4',  col: 1, row: 2 },
  { gear: 'R', label: 'R',  col: 2, row: 2 },
];

export default function ControlPanel({
  state,
  shiftPhase,
  onGearSelect,
  onClutchToggle,
  onRpmChange,
  onPlayToggle,
  onModeToggle,
}: Props) {
  const { selectedGear, clutchEngaged, rpm, playing, mode } = state;
  const isShifting = shiftPhase !== 'idle';
  const rpmMax = mode === 'detail' ? 6000 : 3000;

  return (
    <div className="flex flex-col gap-5 p-4 border-t border-slate-700">
      {/* ギアシフターH型グリッド */}
      <div>
        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">シフトレバー</p>
        <div className="relative grid grid-cols-3 grid-rows-3 gap-1" style={{ width: 168, height: 168 }}>
          {/* 中央横バー（N位置インジケータ） */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-0">
            <div className="w-full h-0.5 bg-slate-600 rounded" />
          </div>
          {/* 縦バー3本 */}
          {[0, 1, 2].map((col) => (
            <div
              key={col}
              className="absolute top-0 bottom-0 w-0.5 bg-slate-600 rounded pointer-events-none z-0"
              style={{ left: `calc(${col} * 33.33% + 16.67% - 1px)` }}
            />
          ))}

          {/* ギアボタン */}
          {GEAR_POSITIONS.map(({ gear, label, col, row }) => {
            const isSelected = selectedGear === gear;
            const isPulsing = isSelected && isShifting;
            return (
              <button
                key={gear}
                onClick={() => onGearSelect(gear)}
                style={{
                  gridColumn: col + 1,
                  gridRow: row + 1,
                }}
                className={[
                  'relative z-10 w-12 h-12 rounded-full font-bold text-sm transition-all',
                  'flex items-center justify-center',
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-300'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
                  isPulsing ? 'animate-pulse' : '',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}

          {/* Nボタン（中央バー上） */}
          <button
            onClick={() => onGearSelect('N')}
            style={{ gridColumn: 2, gridRow: 2 }}
            className={[
              'relative z-10 w-12 h-12 rounded-full font-bold text-sm transition-all',
              'flex items-center justify-center',
              selectedGear === 'N'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-300'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
              selectedGear === 'N' && isShifting ? 'animate-pulse' : '',
            ].join(' ')}
          >
            N
          </button>
        </div>
      </div>

      {/* クラッチトグル */}
      <div>
        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">クラッチ</p>
        <button
          onClick={onClutchToggle}
          className={[
            'w-full py-2.5 rounded-lg font-semibold text-sm transition-all',
            clutchEngaged
              ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              : 'bg-red-700 text-red-100 hover:bg-red-600 ring-2 ring-red-500',
          ].join(' ')}
        >
          {clutchEngaged ? '✓ クラッチ接続中' : '✕ クラッチ切断中'}
        </button>
      </div>

      {/* RPMスライダー */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-slate-500 uppercase tracking-wide">エンジン回転数</p>
          <span className="font-mono text-cyan-400 text-sm">{rpm} rpm</span>
        </div>
        <input
          type="range"
          min={600}
          max={rpmMax}
          step={50}
          value={rpm}
          onChange={(e) => onRpmChange(Number(e.target.value))}
          className="w-full accent-cyan-400 cursor-pointer"
        />
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>600</span>
          <span>{rpmMax}</span>
        </div>
      </div>

      {/* 再生/一時停止 */}
      <div className="flex gap-2">
        <button
          onClick={onPlayToggle}
          className={[
            'flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all',
            playing
              ? 'bg-amber-600 text-amber-100 hover:bg-amber-500'
              : 'bg-slate-700 text-slate-200 hover:bg-slate-600',
          ].join(' ')}
        >
          {playing ? '⏸ 一時停止' : '▶ 再生'}
        </button>
      </div>

      {/* 初心者/詳細モード切替 */}
      <div>
        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">表示モード</p>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button
            onClick={() => mode !== 'beginner' && onModeToggle()}
            className={[
              'flex-1 py-2 text-sm font-medium transition-all',
              mode === 'beginner'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700',
            ].join(' ')}
          >
            初心者
          </button>
          <button
            onClick={() => mode !== 'detail' && onModeToggle()}
            className={[
              'flex-1 py-2 text-sm font-medium transition-all',
              mode === 'detail'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700',
            ].join(' ')}
          >
            詳細
          </button>
        </div>
      </div>
    </div>
  );
}
