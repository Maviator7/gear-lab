# GearLab Phase3 Tutorial Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an eight-step interactive MT tutorial, three-question quiz, scored completion screen, engine start/stop control, and contextual 3D/control highlighting without regressing the existing Phase2 simulator.

**Architecture:** Keep the Phase2 transmission hook and simulation as the mechanical source of truth. Add a data-only tutorial definition, pure progression functions, and a `useTutorial` orchestration hook that observes transmission snapshots/events. Compose tutorial DOM above the existing canvas, and pass only typed highlight flags into Three.js components.

**Tech Stack:** React 18, TypeScript 5.6, Vite 6, React Three Fiber 8, Three.js, Tailwind CSS 3, Vitest 2, React Testing Library, jsdom.

**Design Spec:** `docs/superpowers/specs/2026-06-15-gearlab-phase3-tutorial-design.md`

---

## File Structure

### New Tutorial Modules

- `src/tutorial/TutorialDefinition.ts`
  - Data-only MT course content: eight steps, three questions, explanations, highlight metadata.
- `src/tutorial/tutorialProgress.ts`
  - Pure completion predicates, ordered event observation, and quiz score calculation.
- `src/tutorial/useTutorial.ts`
  - Tutorial phase, current step, success timer, event observation, quiz answers, restart/exit.
- `src/tutorial/TutorialOverlay.tsx`
  - Step guide displayed above the 3D canvas.
- `src/tutorial/QuizPanel.tsx`
  - One-question-at-a-time three-choice quiz.
- `src/tutorial/CompletionPanel.tsx`
  - Course result and restart/normal-mode commands.
- `src/tutorial/TutorialModeSwitch.tsx`
  - Header segmented control.
- `src/tutorial/TutorialExitDialog.tsx`
  - In-app confirmation dialog for abandoning progress.
- `src/tutorial/types.ts`
  - Tutorial contracts shared by definition, hook, UI, and 3D scene.

### New Tests

- `src/tutorial/tutorialProgress.test.ts`
- `src/tutorial/useTutorial.test.tsx`
- `src/tutorial/TutorialOverlay.test.tsx`
- `src/tutorial/QuizPanel.test.tsx`
- `src/tutorial/CompletionPanel.test.tsx`
- `src/tutorial/TutorialModeSwitch.test.tsx`
- `src/hooks/useTransmissionState.test.tsx`
- `src/components/ControlPanel.test.tsx`
- `src/App.test.tsx`
- `src/components/gearVisual.test.ts`

### Modified Production Files

- `package.json`, `package-lock.json`, `vite.config.ts`
  - Test dependencies and scripts.
- `src/types.ts`
  - Engine state and assisted-shift flag.
- `src/hooks/useTransmissionState.ts`
  - Engine commands, atomic baselines, simulation remount key, assisted shifts.
- `src/hooks/useGearboxAnimation.ts`
  - Effective RPM and assisted deterministic shift path.
- `src/components/ControlPanel.tsx`
  - Engine button, tutorial restrictions, control highlights.
- `src/components/GearboxScene.tsx`
  - Typed 3D highlight routing and duplicate `GrindEffect` cleanup.
- `src/components/Gear.tsx`
  - Tutorial highlight appearance with semantic-priority rules.
- `src/components/Clutch.tsx`
  - Engine/clutch highlights and effective RPM.
- `src/components/Shaft.tsx`
  - Optional tutorial highlight.
- `src/components/Synchronizer.tsx`
  - Tutorial highlight below active synchronization amber.
- `src/App.tsx`
  - Mode ownership, event fan-out, tutorial overlay, exit dialog, baseline commands.
- `src/index.css`
  - Responsive shell, overlay placement, reduced-motion behavior.

---

### Task 1: Add the Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.tsx`

- [ ] **Step 1: Install Node 18-compatible test dependencies**

Run:

```bash
npm install --save-dev vitest@2.1.9 jsdom@25.0.1 @testing-library/react@16.1.0 @testing-library/jest-dom@6.6.3 @testing-library/user-event@14.5.2
```

Expected: dependencies are added without changing React, Vite, Three.js, or Tailwind major versions.

- [ ] **Step 2: Write the smoke test before jsdom is configured**

Create `src/test/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function Harness() {
  return <button>GearLab test harness</button>;
}

describe('test harness', () => {
  it('renders accessible React content', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'GearLab test harness' })).toBeVisible();
  });
});
```

Temporarily add only `"test": "vitest run"` to `package.json`, then run:

```bash
npm test -- src/test/smoke.test.tsx
```

Expected: FAIL with `document is not defined` or a missing jest-dom matcher
because the browser environment and setup file are not configured yet.

- [ ] **Step 3: Add test scripts and Vitest configuration**

Update `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Update `vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    clearMocks: true,
  },
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Complete the configuration and verify green**

Run:

```bash
npm test -- src/test/smoke.test.tsx
npm run build
```

Expected: one passing test; production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/test
git commit -m "test: add frontend test harness"
```

---

### Task 2: Define the Course and Pure Progression Rules

**Files:**
- Create: `src/tutorial/types.ts`
- Create: `src/tutorial/TutorialDefinition.ts`
- Create: `src/tutorial/tutorialProgress.ts`
- Create: `src/tutorial/tutorialProgress.test.ts`

- [ ] **Step 1: Write failing tests for all eight completion predicates**

Create a table-driven `tutorialProgress.test.ts` that uses this observation shape:

```ts
export interface TutorialObservation {
  engineRunning: boolean;
  rpm: number;
  clutchEngaged: boolean;
  tState: TransmissionState;
  lockedGear: GearPosition;
  powerFlow: boolean;
  eventStage: 0 | 1 | 2 | 3;
  engagedDuringStep: GearPosition | null;
  clutchStayedDisengaged: boolean;
}
```

Tests must include:

```ts
it.each([
  ['start-engine', runningObservation, true],
  ['select-1', { ...base, lockedGear: '1', engagedDuringStep: '1' }, true],
  ['select-5', { ...base, lockedGear: '5', engagedDuringStep: '5' }, true],
  ['select-neutral', { ...base, lockedGear: 'N', engagedDuringStep: 'N' }, true],
  ['disengage-clutch', { ...base, clutchEngaged: false, tState: TransmissionState.CLUTCH_DISENGAGED }, true],
  ['shift-with-clutch', { ...base, clutchEngaged: false, lockedGear: '1', engagedDuringStep: '1', clutchStayedDisengaged: true }, true],
  ['engage-clutch', { ...base, clutchEngaged: true, lockedGear: '1', powerFlow: true }, true],
  ['observe-synchronizer', { ...base, lockedGear: '2', eventStage: 3 }, true],
])('%s completion is %s', (action, observation, expected) => {
  expect(isTutorialActionComplete(action, observation)).toBe(expected);
});
```

Add negative cases:

- engine is running below 800 RPM
- selected gear changed but no matching `engaged` event occurred
- clutch was reconnected before step 6 engagement
- step 8 saw events out of order or for the wrong gear

- [ ] **Step 2: Run the progression test and verify RED**

Run:

```bash
npm test -- src/tutorial/tutorialProgress.test.ts
```

Expected: FAIL because tutorial modules do not exist.

- [ ] **Step 3: Add tutorial types and the data-only definition**

Implement the exact contracts from the design spec in `types.ts`. Export:

```ts
export type AppMode = 'normal' | 'tutorial';
export type TutorialPhase = 'steps' | 'quiz' | 'completed';
export type TutorialStepStatus = 'waiting' | 'achieved';
export type TutorialHighlight =
  | 'engine'
  | 'gear-1'
  | 'gear-5'
  | 'gear-train'
  | 'output-shaft'
  | 'clutch'
  | 'shifter'
  | 'synchronizer';
```

Populate `MT_BASICS_TUTORIAL` with exactly eight steps and the three Japanese
questions/options approved in the spec. Keep completion functions out of the
definition file.

- [ ] **Step 4: Implement pure progression and event reduction**

Export:

```ts
export function createTutorialObservation(): TutorialObservation;
export function observeTransmissionEvent(
  observation: TutorialObservation,
  event: TransmissionEvent,
  expectedGear: GearPosition | null,
): TutorialObservation;
export function isTutorialActionComplete(
  action: TutorialAction,
  observation: TutorialObservation,
): boolean;
export function calculateTutorialScore(correctAnswers: number, total: number): number;
```

For step 8, accept only:

```text
synchroStart(2) -> syncReady -> engaged(2)
```

Reset the ordered stage to `0` when a wrong gear starts synchronizing. Never
advance the stage from an out-of-order event.

- [ ] **Step 5: Add score tests and verify GREEN**

```ts
expect(calculateTutorialScore(0, 3)).toBe(0);
expect(calculateTutorialScore(1, 3)).toBe(33);
expect(calculateTutorialScore(2, 3)).toBe(67);
expect(calculateTutorialScore(3, 3)).toBe(100);
```

Run:

```bash
npm test -- src/tutorial/tutorialProgress.test.ts
```

Expected: all progression and score tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tutorial/types.ts src/tutorial/TutorialDefinition.ts src/tutorial/tutorialProgress.ts src/tutorial/tutorialProgress.test.ts
git commit -m "feat: define tutorial course and progression rules"
```

---

### Task 3: Add Engine State, Atomic Baselines, and Assisted Shift Commands

**Files:**
- Modify: `src/types.ts`
- Modify: `src/hooks/useTransmissionState.ts`
- Modify: `src/hooks/useGearboxAnimation.ts`
- Create: `src/hooks/useTransmissionState.test.tsx`

- [ ] **Step 1: Write failing hook tests for engine commands**

Use `renderHook` and assert:

```ts
const { result } = renderHook(() => useTransmissionState());

expect(result.current.state.engineRunning).toBe(true);
expect(result.current.state.rpm).toBe(1200);

act(() => result.current.toggleEngine());
expect(result.current.state.engineRunning).toBe(false);
expect(result.current.state.rpm).toBe(0);

act(() => result.current.toggleEngine());
expect(result.current.state.engineRunning).toBe(true);
expect(result.current.state.rpm).toBe(800);
```

- [ ] **Step 2: Write failing baseline/reset tests**

Exercise a non-neutral state, then call:

```ts
act(() => result.current.enterTutorialBaseline());
```

Assert:

- engine stopped at `0 rpm`
- selected gear is `N`
- clutch connected
- Phase2 mode is `detail`
- `simRef.current` equals a fresh neutral simulation
- `simulationKey` increments

Then call `exitTutorialBaseline(savedMode)` and assert neutral, clutch connected,
engine running at `1200 rpm`, and the saved normal display mode is restored.

- [ ] **Step 3: Write failing assisted-shift API tests**

Call:

```ts
act(() => result.current.requestAssistedShift('1'));
```

Assert `selectedGear === '1'` and `shiftAssistActive === true`. Feed:

```ts
act(() => result.current.handleSimEvent({ type: 'engaged', gear: '1' }));
```

Assert `shiftAssistActive === false`. Repeat for neutral and verify the clutch
state remains connected after the event.

- [ ] **Step 4: Run the hook tests and verify RED**

Run:

```bash
npm test -- src/hooks/useTransmissionState.test.tsx
```

Expected: FAIL because the new state and commands do not exist.

- [ ] **Step 5: Extend state and API minimally**

Add to `GearboxState`:

```ts
engineRunning: boolean;
shiftAssistActive: boolean;
```

Add to `TransmissionApi`:

```ts
simulationKey: number;
toggleEngine: () => void;
enterTutorialBaseline: () => void;
exitTutorialBaseline: (mode: ViewMode) => void;
requestAssistedShift: (gear: GearPosition) => void;
```

Implement a shared baseline helper that:

1. clears failure timers/warnings,
2. replaces `simRef.current` with `createInitialSim()`,
3. increments `simulationKey`,
4. sets state and `tState` atomically.

`setRpm` must ignore slider writes while `engineRunning` is false.

- [ ] **Step 6: Switch animation by shift behavior and effective RPM**

In `useGearboxAnimation.ts`, define:

```ts
type SimulationBehavior = 'automatic' | 'manual';

const effectiveRpm = st.engineRunning ? st.rpm : 0;
const behavior: SimulationBehavior = st.shiftAssistActive || st.mode === 'beginner'
  ? 'automatic'
  : 'manual';
```

Track the previous behavior, not only `mode`, in `Work`, and reset a partial
sequence when behavior changes. Use `effectiveRpm` in both automatic and manual
speed models.

The UI remains `detail` during assisted steps, but `tickBeginner` runs while
`shiftAssistActive` is true. Existing standard events must still fire.

Pass `behavior` and `effectiveRpm` into `finishFrame`. Replace its existing
`st.mode === 'beginner'` output-derivation branch with
`behavior === 'automatic'`; otherwise an assisted detail-mode shift leaves
output speed on the manual path. Also expose stopped-engine telemetry correctly:

```ts
sim.rpms.engine = effectiveRpm;
```

- [ ] **Step 7: Verify GREEN and regression build**

Run:

```bash
npm test -- src/hooks/useTransmissionState.test.tsx
npm test
npm run build
```

Expected: all tests and build pass.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/hooks/useTransmissionState.ts src/hooks/useGearboxAnimation.ts src/hooks/useTransmissionState.test.tsx
git commit -m "feat: add engine and tutorial transmission commands"
```

---

### Task 4: Implement Tutorial Runtime State with TDD

**Files:**
- Create: `src/tutorial/useTutorial.ts`
- Create: `src/tutorial/useTutorial.test.tsx`

- [ ] **Step 1: Write failing entry and step-progress tests**

Define a small test harness around `renderHook` with a mutable observation.
Assert:

- initial state is inactive, phase `steps`, index `0`
- `enterTutorial()` activates step 1 and clears prior answers
- unmet conditions do not advance
- meeting the condition changes status to `achieved`
- fake timers advance to the next step after `1000ms`
- `advanceNow()` during achieved state advances once and cancels the stale timer

Use:

```ts
vi.useFakeTimers();
act(() => vi.advanceTimersByTime(1000));
```

- [ ] **Step 2: Write failing event-order and quiz tests**

Assert:

- step-local event memory resets on each new step
- step 8 accepts only `synchroStart(2)`, `syncReady`, `engaged(2)`
- after step 8, phase becomes `quiz`
- submitting an answer locks it
- quiz index advances only after `nextQuestion()`
- result phase computes `0/33/67/100`
- restart returns to step 1 and clears answers/timers
- exit cancels pending timers and deactivates

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npm test -- src/tutorial/useTutorial.test.tsx
```

Expected: FAIL because `useTutorial` does not exist.

- [ ] **Step 4: Implement the hook**

Use one timeout ref and clear it in:

- step change
- `advanceNow`
- `restartTutorial`
- `exitTutorial`
- unmount

Public API:

```ts
interface UseTutorialResult {
  active: boolean;
  phase: TutorialPhase;
  stepIndex: number;
  stepStatus: TutorialStepStatus;
  currentStep: TutorialStepDefinition;
  highlights: TutorialHighlight[];
  expectedGear: GearPosition | null;
  assistedShift: boolean;
  quizIndex: number;
  selectedAnswer: string | null;
  answerIsCorrect: boolean | null;
  scorePercent: number | null;
  enterTutorial(): void;
  exitTutorial(): void;
  restartTutorial(): void;
  advanceNow(): void;
  submitAnswer(optionId: string): void;
  nextQuestion(): void;
  observeSnapshot(snapshot: TutorialSnapshot): void;
  handleTransmissionEvent(event: TransmissionEvent): void;
}
```

Keep transmission commands outside the hook. `App.tsx` reacts to tutorial mode
and invokes transmission API commands.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- src/tutorial/useTutorial.test.tsx src/tutorial/tutorialProgress.test.ts
```

Expected: all tutorial state tests pass with fake timers restored after each test.

- [ ] **Step 6: Commit**

```bash
git add src/tutorial/useTutorial.ts src/tutorial/useTutorial.test.tsx
git commit -m "feat: add tutorial runtime state"
```

---

### Task 5: Build Tutorial, Quiz, and Completion Panels

**Files:**
- Create: `src/tutorial/TutorialOverlay.tsx`
- Create: `src/tutorial/QuizPanel.tsx`
- Create: `src/tutorial/CompletionPanel.tsx`
- Create: `src/tutorial/TutorialOverlay.test.tsx`
- Create: `src/tutorial/QuizPanel.test.tsx`
- Create: `src/tutorial/CompletionPanel.test.tsx`

- [ ] **Step 1: Write failing overlay tests**

Render a step and assert:

- `STEP 2 / 8`
- title and instruction
- `なぜそうなるのか`
- progress width/accessible value
- waiting `次へ` is disabled
- achieved `次へ` is enabled
- live synchronization values appear only when provided
- `aria-live="polite"` contains achievement status

- [ ] **Step 2: Write failing quiz tests**

Use `userEvent` to select one of three options. Assert:

- exactly three radio-like buttons are shown
- selection calls `onSubmit`
- submitted question shows correct/incorrect text and explanation
- all options lock after submission
- last question shows `結果を見る`; earlier questions show `次の問題`

- [ ] **Step 3: Write failing completion tests**

Assert the panel renders:

- `MT基礎コース修了`
- provided percentage
- `もう一度学ぶ`
- `通常モードへ戻る`

- [ ] **Step 4: Run component tests and verify RED**

Run:

```bash
npm test -- src/tutorial/TutorialOverlay.test.tsx src/tutorial/QuizPanel.test.tsx src/tutorial/CompletionPanel.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 5: Implement focused presentational components**

Do not import transmission hooks into these files. Every action and value arrives
through props. Use compact typography appropriate to a simulator overlay, an
8px-or-smaller radius, and no decorative nested cards.

`TutorialOverlay` root must expose:

```tsx
data-placement={step.overlayPlacement}
data-status={status}
```

so responsive CSS can place it without step-specific component logic.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm test -- src/tutorial/TutorialOverlay.test.tsx src/tutorial/QuizPanel.test.tsx src/tutorial/CompletionPanel.test.tsx
```

Expected: all panel tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/tutorial/TutorialOverlay.tsx src/tutorial/QuizPanel.tsx src/tutorial/CompletionPanel.tsx src/tutorial/*.test.tsx
git commit -m "feat: add tutorial learning and quiz panels"
```

---

### Task 6: Add Mode Controls, Exit Dialog, and App Wiring

**Files:**
- Create: `src/tutorial/TutorialModeSwitch.tsx`
- Create: `src/tutorial/TutorialExitDialog.tsx`
- Create: `src/tutorial/TutorialModeSwitch.test.tsx`
- Modify: `src/components/ControlPanel.tsx`
- Create: `src/components/ControlPanel.test.tsx`
- Modify: `src/App.tsx`
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write failing header-mode and exit-dialog tests**

Assert:

- two buttons expose `aria-pressed`
- selecting tutorial calls `onTutorial`
- selecting normal during unfinished tutorial opens the in-app dialog
- `続ける` closes it without exiting
- `チュートリアルを終了` confirms exit
- completion-phase exit skips the dialog

- [ ] **Step 2: Write failing ControlPanel tests**

Add props:

```ts
onEngineToggle: () => void;
tutorialActive: boolean;
controlsDisabled: boolean;
allowedGears: GearPosition[] | null;
highlightAction: TutorialAction | null;
```

Test:

- stopped engine shows `エンジン始動`
- running engine shows `エンジン停止`
- RPM slider is disabled while stopped
- beginner/detail buttons are disabled during tutorial
- only expected assisted-step gear is enabled
- highlighted engine/clutch/gear control gets `data-tutorial-highlight="true"`
- all simulation controls disable during quiz/completion

- [ ] **Step 3: Write a failing App integration test with mocks**

Mock `GearboxScene` so jsdom does not need WebGL. Mock or inject the
transmission hook enough to assert:

- entering tutorial calls `enterTutorialBaseline`
- App renders the step overlay above the scene container
- expected assisted gear calls `requestAssistedShift`
- event fan-out sends the same event to transmission and tutorial handlers
- entering quiz disables simulation controls
- restart calls both tutorial restart and tutorial baseline reset

- [ ] **Step 4: Run tests and verify RED**

Run:

```bash
npm test -- src/tutorial/TutorialModeSwitch.test.tsx src/components/ControlPanel.test.tsx src/App.test.tsx
```

Expected: FAIL because the new contracts and wiring do not exist.

- [ ] **Step 5: Implement mode and dialog components**

Use familiar segmented controls and a real accessible dialog:

```tsx
<div role="dialog" aria-modal="true" aria-labelledby="tutorial-exit-title">
```

Do not use `window.confirm`.

- [ ] **Step 6: Extend ControlPanel**

Place the engine command above RPM. Keep the H-pattern dimensions stable.
Derive enabled gear buttons from `allowedGears`; `null` means normal Phase2
behavior. Preserve existing Phase2 visual states when tutorial is inactive.

- [ ] **Step 7: Wire App**

`App` owns:

- saved normal-mode beginner/detail preference
- tutorial mode switch and exit-dialog visibility
- transmission event fan-out
- mapping the current tutorial action to enabled/highlighted controls
- mapping step 2-4 shifter actions to `requestAssistedShift`
- mapping step 5-8 actions to normal transmission commands

Wrap the canvas region:

```tsx
<main className="gearbox-stage">
  <GearboxScene key={transmission.simulationKey} ... />
  {tutorial.active && tutorial.phase === 'steps' && <TutorialOverlay ... />}
  {tutorial.phase === 'quiz' && <QuizPanel ... />}
  {tutorial.phase === 'completed' && <CompletionPanel ... />}
</main>
```

The key is required: replacing `simRef.current` alone does not reset the private
`Work` ref inside `useGearboxAnimation`. Remounting the scene resets both the
public simulation object and frame-loop work variables.

After each React render, feed the current transmission snapshot to
`tutorial.observeSnapshot` from an effect with stable scalar dependencies. Do
not call it unconditionally during render. `observeSnapshot` must avoid state
writes after the active step is already achieved, preventing an effect/render
loop.

- [ ] **Step 8: Verify GREEN**

Run:

```bash
npm test -- src/tutorial/TutorialModeSwitch.test.tsx src/components/ControlPanel.test.tsx src/App.test.tsx
npm test
npm run build
```

Expected: all tests and build pass.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/components/ControlPanel.tsx src/components/ControlPanel.test.tsx src/tutorial/TutorialModeSwitch.tsx src/tutorial/TutorialExitDialog.tsx src/tutorial/TutorialModeSwitch.test.tsx src/App.test.tsx
git commit -m "feat: wire tutorial mode into the application"
```

---

### Task 7: Add Semantic-Priority 3D Highlights

**Files:**
- Modify: `src/components/GearboxScene.tsx`
- Modify: `src/components/Gear.tsx`
- Modify: `src/components/Clutch.tsx`
- Modify: `src/components/Shaft.tsx`
- Modify: `src/components/Synchronizer.tsx`
- Create: `src/components/gearVisual.test.ts`

- [ ] **Step 1: Write failing material-priority tests**

Extract a pure helper from `Gear.tsx`:

```ts
export interface GearMaterialState {
  emissive: 'none' | 'cyan' | 'amber';
  intensity: number;
  opacity: number;
}

export function resolveGearMaterial(
  mode: GearVisualMode,
  tutorialHighlighted: boolean,
): GearMaterialState;
```

Test priority:

```ts
expect(resolveGearMaterial('powered', true).emissive).toBe('amber');
expect(resolveGearMaterial('selected', true).emissive).toBe('cyan');
expect(resolveGearMaterial('normal', true).emissive).toBe('cyan');
expect(resolveGearMaterial('free', true).opacity).toBeGreaterThan(0.45);
expect(resolveGearMaterial('normal', false).emissive).toBe('none');
```

- [ ] **Step 2: Run the visual helper test and verify RED**

Run:

```bash
npm test -- src/components/gearVisual.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Route typed highlights through the scene**

Add to `GearboxScene`:

```ts
highlights?: TutorialHighlight[];
```

Map:

- `engine` and `clutch` to `Clutch`
- `gear-1`/`gear-5` to both gears in that pair
- `gear-train` to constant mesh and all pairs at lower intensity
- `output-shaft` to only the output shaft
- `synchronizer` to all synchronizers, strongest on the target hub

Remove the duplicate `GrindEffect` render while editing this file.

- [ ] **Step 4: Implement component highlight props**

Use boolean/intensity props, not the full tutorial object:

```ts
tutorialHighlight?: boolean;
tutorialHighlightStrength?: 'soft' | 'strong';
```

In `Clutch`, use `effectiveRpm` for flywheel animation. In `Synchronizer`, active
Phase2 amber glow must override tutorial cyan. In `Shaft`, modify the main shaft
material and ribs together so the object reads as one highlighted part.

Honor reduced motion by changing intensity without sinusoidal pulsing when:

```css
@media (prefers-reduced-motion: reduce)
```

- [ ] **Step 5: Verify helper tests and build**

Run:

```bash
npm test -- src/components/gearVisual.test.ts
npm test
npm run build
```

Expected: tests and build pass with no duplicate-key or Three.js warnings.

- [ ] **Step 6: Commit**

```bash
git add src/components/GearboxScene.tsx src/components/Gear.tsx src/components/Clutch.tsx src/components/Shaft.tsx src/components/Synchronizer.tsx src/components/gearVisual.test.ts
git commit -m "feat: highlight tutorial parts in the 3d scene"
```

---

### Task 8: Finish Responsive Layout and Accessibility

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/tutorial/TutorialOverlay.tsx`
- Modify: `src/tutorial/QuizPanel.tsx`
- Modify: `src/tutorial/CompletionPanel.tsx`
- Modify: `src/tutorial/TutorialOverlay.test.tsx`
- Modify: `src/tutorial/QuizPanel.test.tsx`
- Modify: `src/tutorial/CompletionPanel.test.tsx`
- Modify: `src/components/ControlPanel.test.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add failing responsive/accessibility assertions**

Component tests must assert:

- step heading has a stable focus target (`tabIndex={-1}`)
- quiz panel uses `role="dialog"` and `aria-modal="true"`
- correctness is expressed in text, not color alone
- mode buttons and engine button have accessible pressed/state labels
- no control button relies on an emoji-only accessible name

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- src/tutorial src/components/ControlPanel.test.tsx src/App.test.tsx
```

Expected: at least one new accessibility assertion fails.

- [ ] **Step 3: Implement stable desktop dimensions**

Use CSS classes rather than large inline Tailwind strings for the application
shell:

```css
.gearbox-stage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.tutorial-overlay {
  position: absolute;
  width: min(340px, calc(100% - 32px));
  max-height: calc(100% - 32px);
  overflow: auto;
}
```

Top-left/top-right placement comes from `data-placement`.

- [ ] **Step 4: Implement narrow layout**

At a practical breakpoint determined from the current 384px sidebar:

- stack the 3D stage above controls
- cap the controls region height and allow scrolling
- change tutorial guide to a bottom sheet inside `.gearbox-stage`
- preserve a visible portion of the canvas
- keep header mode controls wrapping without overlapping the title

Do not scale font size with viewport width.

- [ ] **Step 5: Add focus and reduced-motion behavior**

On automatic step/question changes, focus the new heading in an effect.
Disable tutorial pulse/keyframe animation under reduced motion.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm test
npm run build
```

Expected: all tests and build pass.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/index.css src/tutorial src/components/ControlPanel.test.tsx src/App.test.tsx
git commit -m "feat: polish tutorial responsiveness and accessibility"
```

---

### Task 9: Verify the Complete Learning Flow

**Files:**
- Modify only if verification exposes a defect.
- Update: `README.md` with the tutorial and engine controls after behavior is verified.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
npm test
npm run build
```

Expected: all tests pass; TypeScript and Vite build complete without errors.

- [ ] **Step 2: Start the development server**

Run:

```bash
npm run dev
```

Expected: Vite prints an available localhost URL. Keep the session running.

- [ ] **Step 3: Verify the desktop flow in the in-app browser**

Use the Browser plugin and complete:

1. enter tutorial
2. start engine
3. select assisted 1st
4. select assisted 5th
5. select assisted neutral
6. disengage clutch
7. manually select 1st and wait for engagement
8. re-engage clutch
9. disengage clutch, select 2nd, observe sync percentage and engagement
10. answer all three quiz questions
11. verify score and both completion commands

At every step verify:

- the expected control is enabled and highlighted
- unrelated assisted-step gears are disabled
- the overlay does not cover the highlighted part
- the correct 3D part glows with the intended priority
- automatic progression occurs once
- console has no errors

- [ ] **Step 4: Verify narrow/mobile layout**

Use browser viewport controls at approximately `390x844` and verify:

- header controls do not overlap
- canvas remains visible
- guide becomes a bottom sheet
- learning text scrolls inside its bounds
- shifter, clutch, engine, and quiz buttons fit without text clipping
- no horizontal page scroll

- [ ] **Step 5: Verify normal-mode regression**

Return to normal mode and verify:

- beginner automatic shift still succeeds
- detail mode still rejects shifts with clutch connected
- manual detail shift still synchronizes and engages
- engine stop/start works
- pause/play and RPM controls still work
- existing warnings and grind effect render once

- [ ] **Step 6: Update README**

Add concise sections for:

- normal/tutorial header switch
- engine start/stop
- eight-step MT fundamentals course
- three-question completion quiz

Do not duplicate the full design spec.

- [ ] **Step 7: Re-run final verification**

Run:

```bash
npm test
npm run build
git diff --check
git status --short
```

Expected: tests/build pass; no whitespace errors; only intended README or
verification fixes are uncommitted.

- [ ] **Step 8: Commit**

```bash
git add README.md
git add src package.json package-lock.json vite.config.ts
git commit -m "docs: document interactive tutorial mode"
```

- [ ] **Step 9: Request final code review**

Use `superpowers:requesting-code-review` against the complete Phase3 diff.
Resolve all blocking findings, then repeat:

```bash
npm test
npm run build
```

Expected: clean review and green verification.
