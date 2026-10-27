window.__ModuleLoader__.load({
  id: 'dsh-plan-build-mode',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'planBuild'

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'chip.build': '构建',
      'chip.build.aria': '当前为构建模式，按下切换到计划模式',
      'chip.build.title': '构建模式 — 点击切换到计划模式（Tab）',
      'chip.failed': '切换失败',
      'chip.unavailable': '模式控制不可用',
      'shortcut.toggle': '切换构建 / 计划模式',
    }

    /** English dictionary, checked complete against the zh key set. */
    const en = {
      'chip.build': 'Build',
      'chip.build.aria': 'Build mode, press to switch to plan mode',
      'chip.build.title': 'Build mode — click to switch to plan mode (Tab)',
      'chip.failed': 'Switch failed',
      'chip.unavailable': 'Mode control unavailable',
      'shortcut.toggle': 'Toggle Build / Plan mode',
    }

    const CSS = [
      '.dpb-wrap{align-items:center;gap:6px;display:inline-flex}',
      '.dpb-chip{box-sizing:border-box;height:28px;min-width:34px;padding:0 8px;',
      'border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);',
      'background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-primary);',
      'font:inherit;font-size:13px;font-weight:500;line-height:20px;display:inline-flex;',
      'align-items:center;gap:4px;margin:0;cursor:pointer;transition:background-color .12s}',
      '.dpb-chip:hover:not(:disabled){background:var(--dsw-alias-state-business-tertiary)}',
      '.dpb-chip:focus-visible{outline:var(--dsw-focus-ring-width) solid ',
      'var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dpb-chip:disabled{opacity:.6;cursor:default}',
      '.dpb-glyph{flex:none;width:14px;height:14px;display:inline-flex;color:currentColor}',
      '.dpb-error{color:var(--dsw-alias-state-primary,var(--dsw-alias-state-error-primary));',
      'font-size:12px;line-height:18px}',
    ].join('')

    function hammer() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M2.6 13.1l4.2-4.2',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M8.1 2.5l4.9 4.9-2.2 2.2-4.9-4.9z',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinejoin: 'round',
        }),
      )
    }

    /**
     * Build-mode affordance in the composer tool row.
     *
     * The seat only carries the inactive half of the mode: while plan mode is the
     * effective target the shipped `conversation.input.plan` chip already names it,
     * so this control renders nothing and only keeps the parent's state cache fresh.
     */
    function ModeChip({ useProjection, applyPlanMode, syncPlanState, t }) {
      const plan = useProjection('plan')
      const effective = plan == null ? undefined : plan.pending ? !plan.active : plan.active
      const label = typeof t === 'function' ? t : (key) => key
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const alive = React.useRef(true)
      const sync = React.useRef(syncPlanState)
      sync.current = syncPlanState

      React.useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
        }
      }, [])

      React.useEffect(() => {
        if (effective === undefined || typeof sync.current !== 'function') return
        sync.current(effective)
      }, [effective])

      if (effective === undefined || effective) return null

      const enter = () => {
        if (typeof applyPlanMode !== 'function') {
          setError(label('chip.unavailable'))
          return
        }
        setBusy(true)
        setError(null)
        applyPlanMode(true).then(
          (failure) => {
            if (!alive.current) return
            setBusy(false)
            setError(failure)
          },
          (reason) => {
            if (!alive.current) return
            setBusy(false)
            setError(reason instanceof Error ? reason.message : String(reason))
          },
        )
      }

      return h(
        React.Fragment,
        null,
        h('style', { 'data-plugin-css': 'dsh-plan-build-mode' }, CSS),
        h(
          'span',
          { className: 'dpb-wrap' },
          h(
            'button',
            {
              type: 'button',
              className: 'dpb-chip',
              disabled: busy,
              'aria-label': label('chip.build.aria'),
              title: label('chip.build.title'),
              onClick: enter,
            },
            h('span', { className: 'dpb-glyph', 'aria-hidden': true }, hammer()),
            label('chip.build'),
          ),
          error === null
            ? null
            : h('span', { className: 'dpb-error', role: 'status', title: error }, label('chip.failed')),
        ),
      )
    }

    return {
      inject: ['slots', 'remote', 'remote.commands', 'locale', 'shortcuts'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plan-build-mode: dictionaries')

        // Effective plan state per session, published by the composer chip; the keyboard
        // path reads it so Tab and the visible control can never disagree.
        const states = new Map()

        const run = (sessionId, active) => {
          const line = active ? '/plan' : '/plan off'
          return ctx.remote.commands.execute(sessionId, line, []).then((result) => {
            if (!result.ok) return `${result.error.message} (${result.error.code})`
            if (result.value === undefined) return `unknown command: ${line}`
            return null
          })
        }

        ctx.effect(
          () =>
            ctx.shortcuts.registerFixed({
              id: 'plan-build-mode.toggle',
              label: () => t('shortcut.toggle'),
              keys: ['Tab'],
              bindings: [{ code: 'Tab', modifiers: [] }],
              group: 'input',
            }),
          'plan-build-mode: shortcut',
        )

        ctx.effect(
          () =>
            ctx.shortcuts.observeFixedInput((input) => {
              if (input.type === 'reset') return
              const { gesture, context } = input
              if (gesture.code !== 'Tab') return
              if (gesture.repeat || gesture.composing || gesture.defaultPrevented) return
              if (gesture.control || gesture.alt || gesture.shift || gesture.meta) return
              if (context.modal !== null || context.region !== 'editable') return
              const target = context.target
              if (target === null) return
              const region = target.closest('[data-conversation-region]')
              if (region === null || region.dataset.conversationRegion !== 'composer') return
              if (target.closest('[data-approval-key], iframe, .xterm, [inert]') !== null) return
              const occurrence = region.closest('[data-conversation-session]')
              const sessionId = occurrence === null ? undefined : occurrence.dataset.conversationSession
              if (sessionId === undefined) return
              input.consume()
              void run(sessionId, states.get(sessionId) !== true)
            }),
          'plan-build-mode: fixed input',
        )

        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'plan-build-mode',
              order: 10,
              locale: NS,
              inject: (sessionId) => ({
                applyPlanMode: (active) => run(sessionId, active),
                syncPlanState: (effective) => {
                  states.set(sessionId, effective)
                },
              }),
            },
            ModeChip,
          ),
        )
      },
    }
  },
})
