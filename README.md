# dsh-plan-build-mode

Always-visible **Build** control in the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web composer, plus <kbd>Tab</kbd> to switch between Build and Plan mode — the affordance OpenCode provides, for a harness whose plan mode otherwise has no inactive control — and a tool guard that makes plan mode genuinely read-only instead of merely advising.

## Why

Harness ships plan mode (`@deepseek-ai/dsh-plan-mode`) and a composer chip (`@deepseek-ai/dsh-client-ui-plan`), but the chip only renders while plan mode is **active** — its own README lists "No inactive plan control" as a limitation. Entering plan mode therefore means typing `/plan`, opening the `+` command menu, or nothing at all, and once you are in Build mode the composer shows no mode at all.

Its plan mode is also *guidance, not enforcement*: every tool stays callable, so a plan can arrive "for approval" after the model has already edited files. Without a guard, approving a plan only ratifies work the model chose not to do yet.

This plugin adds the missing half:

- a **Build** chip on the left of the composer tool row while plan mode is off;
- <kbd>Tab</kbd> inside the composer toggles Build → Plan → Build, whether or not the draft has text;
- clicking the chip runs the same `/plan` command the harness uses;
- while plan mode is on, `write` and `edit` are denied, matching OpenCode's `permissions: deny edit *`.

While plan mode is on, the shipped blue **Plan** chip next to the access-mode control remains the visible indicator, so the two never appear at once.

## Behaviour

| Situation | What you see | <kbd>Tab</kbd> |
|---|---|---|
| Plan off | neutral **Build** chip | enters plan mode (`/plan`) |
| Plan on | the harness's blue **Plan** chip | leaves plan mode (`/plan off`) |
| Draft has text | **Build** chip | still toggles — only the focus position decides |
| Cursor outside the composer | **Build** chip | left alone |
| Shift/Alt/Ctrl/Cmd + Tab | — | left alone |

Plan-mode state comes from the harness's own `plan` session projection, folded exactly as the shipped chip does it (`pending ? !active : active`), so a mode change requested mid-turn shows the target the harness will actually apply.

## Install

```sh
dsh plugin install /absolute/path/to/dsh-plan-build-mode
```

or, inside a Harness session, ask the agent to `install_bundle` this directory. The bundle inserts one row `plan-build-mode`; no harness files are modified.

## How it works

- Client half registers into the `conversation.input.left` list seat (declared by `ui-conversation`, empty by default, `replaceRisk: none`).
- State reads use the standard-kit `useProjection('plan')`; the toggle runs through `ctx.remote.commands.execute(sessionId, '/plan' | '/plan off', [])`, the same path the shipped chip uses.
- <kbd>Tab</kbd> is a fixed shortcut row (`ctx.shortcuts.registerFixed`) observed through `ctx.shortcuts.observeFixedInput`; the event is consumed only inside the composer editor, so the key still moves focus everywhere else.
- Host half registers one `ctx.tools.guard`. While an agent's plan mode is active it denies `write` and `edit` with a reason that names the legal next step; everything else passes untouched.

## Enforcement

Harness plan mode restrains the model through prompt text only, so a plan could arrive "for approval" after the model had already edited files. The guard makes the phase real:

```js
ctx.tools.guard((exec) => {
  if (!BLOCKED_TOOLS.has(exec.name)) return undefined   // early exit, no cost for reads
  ...
  if (planMode.get(agent).active !== true) return undefined
  return denial(exec.name)
})
```

The tool set matches OpenCode's `permissions: deny edit *` — its `write`/`edit`/`patch` tools. Plan state is read live through the agent's retained preset composition (`agentPresets.serviceFor(agent, 'planMode')`, falling back to `agent.ctx.get('planMode')`), so leaving plan mode restores writes immediately with no restart and no re-registration.

A guard that throws would fail the whole tool pipeline, so every resolution step is wrapped: an agent whose plan mode cannot be resolved is allowed through and warned about once, rather than blocked or crashed.


## Limitations

- **Enforcement covers file edits only.** `write` and `edit` are denied; shell tools are not, matching OpenCode, which denies the `edit` permission but leaves `bash` callable — a shell command can therefore still write to disk. A subagent started from a plan-mode session is a fresh agent with plan mode off, so delegation can also write. Turn plan mode off for real implementation work.
- The chip only covers the opposite state; unifying Plan and Build into a single always-visible control would mean shadowing the shipped `conversation.input.plan` seat.
- Tab is a fixed binding, so it is visible in the shortcut reference but not rebindable. It takes over <kbd>Tab</kbd> anywhere inside the composer editor, with or without a draft; <kbd>Shift</kbd>+<kbd>Tab</kbd> is deliberately not intercepted, so focus can still leave the editor backwards.
- Requires the `ui-conversation` and `client-shortcuts` client packages, which ship with the harness.

## License

MIT
