# GearLab Phase3 Tutorial Mode Design

## Summary

GearLab Phase3 adds an interactive MT fundamentals course on top of the existing
manual-transmission simulator. Learners must operate the engine, shifter, and
clutch to complete eight guided steps, then answer three multiple-choice
questions and receive a completion score.

The tutorial is not a separate simulation. It observes and, only where
explicitly defined, assists the existing transmission state machine. Normal
mode keeps the current free-exploration experience.

## Goals

- Teach gear ratio, torque, clutch behavior, neutral, and synchronizer behavior
  in a fixed beginner-friendly sequence.
- Require real simulator operations rather than passive help text.
- Highlight the part currently being explained in both the 3D scene and the
  relevant control.
- Finish with a three-question knowledge check and a scored completion screen.
- Separate course content from the tutorial engine so future MT, AT, CVT, and
  differential courses can share the same presentation and progression model.

## Non-Goals

- Persisting progress across reloads or devices.
- User accounts, certificates, leaderboards, or sharing results.
- Multiple Phase3 courses. The architecture supports later courses, but only
  the MT fundamentals course is implemented now.
- A general expression language or plugin runtime for completion predicates.
- Changes to Phase2 gear geometry, ratios, or synchronization physics.

## User Experience

### Mode Selection

The application header gains a two-option segmented control:

- `通常モード`
- `チュートリアルモード`

Normal mode is the default. Entering tutorial mode:

1. Resets tutorial progress to step 1.
2. Stops the engine and sets engine RPM to `0`.
3. Selects neutral.
4. Connects the clutch.
5. Forces the simulator display/behavior mode to Phase2 `detail`.
6. Shows the tutorial overlay above the 3D canvas.

The existing beginner/detail selector is disabled while the tutorial is active
and displays `詳細` as selected. It becomes interactive again in normal mode.

Leaving an unfinished tutorial through the header asks for confirmation because
the in-memory progress will be discarded. Leaving from the completion screen
does not ask for confirmation. Confirming the exit returns to normal mode and
restores a safe baseline: neutral, clutch connected, engine running at
`1200 rpm`, and the previously selected normal-mode beginner/detail preference.

### Engine Control

Engine state becomes a first-class part of `GearboxState`:

```ts
engineRunning: boolean;
```

The control panel gains a normal command button:

- Stopped: `エンジン始動`
- Running: `エンジン停止`

Starting the engine sets `engineRunning=true` and sets RPM to `800` when the
current RPM is `0`. Stopping it sets `engineRunning=false` and RPM to `0`.

The RPM slider is disabled while the engine is stopped. Starting after a stop
always resumes at `800 rpm`; the previous running RPM is not restored.

The animation and telemetry use effective engine RPM:

```ts
const effectiveRpm = state.engineRunning ? state.rpm : 0;
```

Therefore the engine block/flywheel, input train, and telemetry visibly stop
instead of treating engine stop as a cosmetic UI state.

## Tutorial Layout

The approved layout is the visual-companion option B: a translucent guide above
the 3D scene.

### Desktop

- Position: inside the 3D region, normally at the upper-left.
- Width: approximately `300-340px`, bounded so it never consumes the full scene.
- Contents:
  - `STEP n / 8`
  - short action title
  - progress bar
  - one-sentence instruction
  - `なぜそうなるのか` learning explanation
  - current status: waiting, achieved, or observing
  - `次へ` button
- The overlay uses a dark translucent background, cyan border, and restrained
  shadow so labels and gears remain visible.
- Overlay position may switch between upper-left and upper-right according to
  the step's highlighted 3D target. This prevents the guide from covering the
  current part.

### Mobile and Narrow Layouts

Below the existing application breakpoint, the overlay becomes an anchored
bottom sheet inside the 3D region. It uses a bounded height with internal
scrolling, and must not overlap the header mode control or hide the entire
canvas. The right control sidebar follows the application's responsive stacking
behavior introduced as part of this work.

### Quiz and Completion

After step 8, the guide area expands into a centered modal-like panel over the
3D scene. The panel remains within the canvas region rather than covering the
right-side controls.

## Tutorial Data Model

Course content lives in:

`src/tutorial/TutorialDefinition.ts`

The definition is data-only. It contains no React state and no direct calls to
the transmission hook.

```ts
export type TutorialHighlight =
  | 'engine'
  | 'gear-1'
  | 'gear-5'
  | 'gear-train'
  | 'output-shaft'
  | 'clutch'
  | 'shifter'
  | 'synchronizer';

export type TutorialAction =
  | 'start-engine'
  | 'select-1'
  | 'select-5'
  | 'select-neutral'
  | 'disengage-clutch'
  | 'shift-with-clutch'
  | 'engage-clutch'
  | 'observe-synchronizer';

export interface TutorialStepDefinition {
  id: string;
  title: string;
  instruction: string;
  explanation: string[];
  action: TutorialAction;
  highlights: TutorialHighlight[];
  overlayPlacement: 'top-left' | 'top-right';
  assistedShift?: boolean;
}

export interface TutorialQuestionDefinition {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
  explanation: string;
}

export interface TutorialDefinition {
  id: string;
  title: string;
  steps: TutorialStepDefinition[];
  questions: TutorialQuestionDefinition[];
}
```

The initial exported definition is `MT_BASICS_TUTORIAL`. It contains exactly
eight steps and three questions.

Future courses may reuse these types and tutorial UI. Course-specific completion
logic remains in an adapter/hook rather than being serialized into the
definition.

## Runtime Architecture

### `useTutorial`

`src/tutorial/useTutorial.ts` owns tutorial-only runtime state:

```ts
type TutorialPhase = 'steps' | 'quiz' | 'completed';

interface TutorialState {
  active: boolean;
  phase: TutorialPhase;
  stepIndex: number;
  stepStatus: 'waiting' | 'achieved';
  quizIndex: number;
  answers: Record<string, string>;
  scorePercent: number | null;
}
```

The hook receives a read-only snapshot of the transmission state:

- `GearboxState`
- `TransmissionState`
- `Telemetry`
- `simRef.current.lockedGear`
- the latest `TransmissionEvent`

It returns:

- current step and phase
- active highlights
- control highlight/action
- whether an assisted shift is active
- quiz state and answer handlers
- restart, enter, and exit handlers

### Event Observation

The tutorial must not infer all behavior from delayed telemetry polling.
`App.tsx` fans each `TransmissionEvent` out to:

1. `useTransmissionState().handleSimEvent`
2. `useTutorial().handleTransmissionEvent`

The tutorial stores only the small event facts needed by the active step, such
as whether `synchroStart` and the subsequent `engaged` event were observed.

### Progression Rules

Completion predicates live as named TypeScript functions in
`src/tutorial/tutorialProgress.ts`. They are pure functions over a tutorial
observation snapshot and can be unit tested without rendering React or Three.js.

When a predicate first becomes true:

1. `stepStatus` becomes `achieved`.
2. The overlay shows a success state for `1000ms`.
3. The next step begins automatically.

The `次へ` button is disabled while the step is waiting. During the one-second
success state it is enabled and advances immediately, allowing the learner to
skip the remaining success delay. The user cannot bypass an unmet action.

Progress never moves backward if the learner later changes the controls.

## Eight-Step Course

### Step 1: Start the Engine

- Instruction: start the engine.
- Highlight: engine and engine-start control.
- Completion: `engineRunning === true` and `rpm >= 800`.
- Learning:
  - The engine is the source of rotational power.
  - With the engine stopped, the transmission has no incoming power.

### Step 2: Select First Gear

- Instruction: select first gear.
- Highlight: 1st-gear pair and the `1` shifter button.
- Assisted shift: enabled.
- Completion: `sim.lockedGear === '1'` and the transmission emitted
  `engaged('1')` during this step.
- Learning:
  - The small driving gear turns a larger driven gear.
  - The larger ratio increases output torque and reduces output speed.
  - Compare it with a bicycle's easy climbing gear.

### Step 3: Change to Fifth Gear

- Instruction: select fifth gear.
- Highlight: 5th-gear pair and the `5` shifter button.
- Assisted shift: enabled.
- Completion: `sim.lockedGear === '5'` and `engaged('5')` was observed.
- Learning:
  - Fifth gear is suitable for higher road speed.
  - Its low ratio provides less torque multiplication.

### Step 4: Select Neutral

- Instruction: select neutral.
- Highlight: gear train, output shaft, and `N` shifter button.
- Assisted shift: enabled.
- Completion: `sim.lockedGear === 'N'` and `engaged('N')` was observed.
- Learning:
  - Constant-mesh gears continue rotating.
  - No gear is locked to the output shaft.

### Step 5: Disengage the Clutch

- Instruction: press/disengage the clutch.
- Highlight: clutch and clutch control.
- Assisted shift: disabled from this step onward.
- Completion: `clutchEngaged === false` and
  `tState === CLUTCH_DISENGAGED`.
- Learning:
  - The clutch separates the engine from the transmission input.
  - The engine may keep running while power transfer is interrupted.

### Step 6: Shift While the Clutch Is Disengaged

- Instruction: keep the clutch disengaged and select first gear.
- Highlight: clutch, shifter, and 1st-gear pair.
- Completion requires all of:
  - the step began with the clutch disengaged,
  - `engaged('1')` is observed during this step,
  - the clutch remained disengaged until that event,
  - `sim.lockedGear === '1'`.
- If the clutch is re-engaged too early, the step remains waiting and the
  existing Phase2 failure feedback explains the failed shift.
- Learning:
  - Disengaging the clutch prepares the gearbox for a ratio change.

### Step 7: Re-engage the Clutch

- Instruction: connect the clutch.
- Highlight: clutch and the power path.
- Completion:
  - `sim.lockedGear === '1'`,
  - `clutchEngaged === true`,
  - `sim.powerFlow === true`.
- Learning:
  - Re-engaging the clutch resumes power transfer from engine to output.

### Step 8: Observe the Synchronizer

- Entry normalization: the overlay instructs the learner to disengage the
  clutch if it is connected. This is part of the same step, not a ninth step.
- Instruction after disengagement: select second gear and watch synchronization.
- Highlight: synchronizer, clutch control until disengaged, then `2` shifter
  button and synchronizer.
- Completion requires the ordered sequence during this step:
  1. clutch is disengaged,
  2. `synchroStart` for gear `2` is observed,
  3. `syncReady` is observed,
  4. `engaged('2')` is observed.
- The guide displays live synchronization percentage and current/target RPM
  while synchronization is active.
- Learning:
  - The synchronizer matches rotational speeds before dog engagement.
  - Matching speed prevents shock and gear grinding.

## Assisted Shifting

Steps 2 through 4 intentionally occur before clutch operation is taught. The
tutorial therefore provides a narrow, temporary shift assistant while keeping
the simulator in Phase2 detail mode.

When an assisted step's required gear button is selected:

1. The assistant disengages the clutch.
2. It requests the selected gear through the existing transmission API.
3. It waits for the matching `engaged` event.
4. It re-engages the clutch unless the target is neutral.

The assistant is active only for the expected action in steps 2, 3, and 4.
Other gear buttons are disabled during those steps. No assistant behavior is
available from step 5 onward.

This logic is exposed by a dedicated transmission command, not by directly
mutating `GearboxState` from tutorial UI. The command reuses the existing
request/event flow so the visible shift animation still runs.

## Quiz

The quiz begins automatically after step 8's success interval. It contains
exactly three questions, one at a time, with three options each:

1. Why is the clutch disengaged?
   - Correct: to separate the engine and transmission.
2. Why does first gear produce strong force?
   - Correct: because its gear ratio is large.
3. What does the synchronizer do?
   - Correct: matches rotational speeds.

Selecting an option:

1. Locks the answer for that question.
2. Immediately marks it correct or incorrect.
3. Shows the question explanation.
4. Enables `次の問題` or, on question 3, `結果を見る`.

Answers cannot be changed after submission. Score is:

```ts
Math.round((correctAnswers / 3) * 100)
```

This produces `0%`, `33%`, `67%`, or `100%`.

## Completion Screen

After the quiz, display:

- `MT基礎コース修了`
- celebratory but restrained visual treatment
- understanding score as a percentage
- `もう一度学ぶ`
- `通常モードへ戻る`

Restart resets engine/transmission/tutorial state to the tutorial entry
baseline. Returning to normal mode uses the normal-mode baseline without an
exit confirmation.

## Highlight System

### React Contract

`GearboxScene` receives:

```ts
highlights: TutorialHighlight[];
```

Highlights are active only in tutorial mode. Components receive the minimum
relevant boolean rather than the whole tutorial state.

### 3D Visual Priority

Tutorial highlighting uses cyan emissive light and a gentle pulse. Existing
simulation colors retain semantic priority:

1. Phase2 failure/grinding red
2. Active synchronizer amber
3. Powered path amber
4. Tutorial cyan
5. Existing selected/free/normal appearance

This avoids turning a currently powered or failing component cyan and hiding
the simulation meaning.

### Component Mapping

- `engine`: engine block and flywheel in `Clutch.tsx`
- `clutch`: clutch disk/flywheel pair in `Clutch.tsx`
- `gear-1`, `gear-5`: both gears in the selected pair in `GearboxScene.tsx`
- `gear-train`: constant mesh and all rotating gear pairs at low cyan intensity
- `output-shaft`: output shaft in `Shaft.tsx`
- `synchronizer`: all synchronizer assemblies, with the active target hub
  receiving the strongest pulse

Controls use the same cyan pulse/ring language through a `highlightAction`
prop. Highlighting never changes enabled/disabled semantics.

## Component Boundaries

### New Files

- `src/tutorial/TutorialDefinition.ts`
  - Course and quiz content.
- `src/tutorial/tutorialProgress.ts`
  - Pure step-completion predicates and score calculation.
- `src/tutorial/useTutorial.ts`
  - Runtime state, event observation, timers, quiz flow.
- `src/tutorial/TutorialOverlay.tsx`
  - Step guide and live synchronization explanation.
- `src/tutorial/QuizPanel.tsx`
  - Three-choice quiz interaction.
- `src/tutorial/CompletionPanel.tsx`
  - Score and restart/exit commands.
- `src/tutorial/types.ts`
  - Shared tutorial types if the definition file becomes too large.

### Modified Files

- `src/types.ts`
  - Add `engineRunning`.
- `src/hooks/useTransmissionState.ts`
  - Add engine commands, tutorial entry/reset command, and assisted-shift
    command with a narrow public API.
- `src/hooks/useGearboxAnimation.ts`
  - Consume effective engine RPM.
- `src/components/ControlPanel.tsx`
  - Engine button, tutorial control highlighting, and disabled states.
- `src/components/GearboxScene.tsx`
  - Highlight routing and overlay container integration. Remove the currently
    duplicated `GrindEffect` render while editing this file.
- `src/components/Clutch.tsx`
  - Effective RPM and engine/clutch tutorial highlight.
- `src/components/Gear.tsx`
  - Tutorial visual mode or highlight modifier with stated priority.
- `src/components/Shaft.tsx`
  - Optional output-shaft highlight.
- `src/components/Synchronizer.tsx`
  - Tutorial highlight below active amber synchronization.
- `src/App.tsx`
  - App mode selection, event fan-out, overlay composition, and exit confirm.
- `src/index.css`
  - Responsive application shell and tutorial overlay transitions.

## Accessibility

- Mode switch, engine command, quiz options, and navigation are real buttons.
- Active mode uses `aria-pressed`.
- Tutorial status changes are announced through a polite live region.
- Quiz correctness feedback uses text and icons in addition to color.
- Focus moves to the step heading after automatic progression and to the
  question heading after quiz progression.
- The overlay does not trap focus; the quiz panel does while active.
- Reduced-motion users receive static rings instead of pulse animation.

## Error and Edge-Case Behavior

- Pausing the simulator freezes mechanical progress. Tutorial timers for
  achieved-state display continue because they are UI timers, but a waiting
  completion predicate cannot pass without the required simulator state/event.
- A failed manual shift does not advance or regress the tutorial.
- Repeated transmission events are idempotent for progress.
- Changing RPM does not complete a step except step 1's minimum running check.
- Unexpected gear buttons are disabled during assisted steps and otherwise use
  the normal Phase2 validation behavior.
- Reloading the page resets the tutorial; no persistence is promised.
- If a component required for a highlight is unavailable, the tutorial remains
  operable because highlights are instructional, not completion conditions.

## Testing Strategy

Add:

- Vitest
- React Testing Library
- `@testing-library/jest-dom`
- jsdom test environment

### Unit Tests

`tutorialProgress.test.ts` covers:

- every step's positive completion condition
- near misses, including wrong gear, early clutch connection, and incomplete
  synchronizer event sequence
- score values for zero through three correct answers

`useTutorial.test.tsx` covers:

- tutorial entry/reset
- achieved state and delayed auto-advance
- manual next during the success delay
- quiz progression and locked answers
- restart and normal-mode exit

### Component Tests

- Mode switch and exit confirmation.
- Engine start/stop and slider disabled state.
- Tutorial overlay content and control highlight props.
- Quiz correctness and completion score.
- Disabled unexpected controls during assisted steps.

### Existing Simulation Regression

- Normal mode remains free exploration.
- Phase2 beginner/detail behavior remains unchanged outside tutorial mode.
- Assisted shifts still emit and animate the standard transmission events.
- Engine stop visibly drives engine RPM and transmission input toward zero.

### Visual Verification

Use the in-app browser after implementation:

- complete the full eight-step tutorial and quiz
- verify highlighted 3D parts and controls at each step
- inspect desktop and narrow/mobile viewports
- check that the overlay does not cover its active target
- check that text, buttons, and progress indicators do not overlap
- inspect console errors and warnings

Run:

```bash
npm test
npm run build
```

Both must pass without errors before completion.

## Acceptance Criteria

1. The header switches between normal and tutorial modes.
2. Tutorial entry creates the defined stopped-engine, neutral baseline and
   locks the simulator to detail mode.
3. The learner completes all eight steps through the specified real operations.
4. Steps 2-4 use visible assisted shifts; steps 5-8 require manual clutch use.
5. An unmet step cannot be skipped.
6. The overlay automatically progresses one second after achievement.
7. The currently explained part and control receive the specified highlight
   without obscuring Phase2 powered, synchronizing, or failure states.
8. Step 8 observes the ordered synchronizer event sequence and displays live
   synchronization data.
9. The three-question quiz immediately explains each answer and calculates the
   score as specified.
10. Completion displays `MT基礎コース修了`, the percentage score, restart, and
    normal-mode return.
11. Normal-mode Phase2 interactions remain available and unchanged.
12. The course definition is separate from runtime progression and UI.
13. Desktop and narrow layouts remain usable without incoherent overlap.
14. Unit/component tests and the production build pass.
