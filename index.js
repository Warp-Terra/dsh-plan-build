/**
 * Host half of dsh-plan-build-mode.
 *
 * Plan mode in the harness restrains the model through prompt text only, so a plan
 * can be "approved" after the model has already edited files. This guard closes that
 * gap the way OpenCode does it (its plan agent denies the `edit` permission): while an
 * agent's plan mode is active, file-editing tools fail with an actionable reason.
 *
 * Shell and subagent tools stay allowed on purpose — OpenCode denies `edit` but not
 * `bash`, so blocking more here would diverge from the mode this plugin mirrors.
 */

/** Tools denied while plan mode is active: OpenCode's `edit` permission action. */
const BLOCKED_TOOLS = new Set(['write', 'edit'])

/**
 * Build the rejection reason the model sees.
 * @param tool - the blocked tool name.
 * @returns a reason naming the next legal step.
 */
function denial(tool) {
  return `Plan mode is active, so \`${tool}\` cannot modify the workspace. Explore and design, then present the plan through exit_plan_mode; the user approves it before any implementation. To implement directly, the user must leave plan mode first (/plan off).`
}

export const inject = ['tools', 'agents', 'agentPresets']

/**
 * Register the plan-mode guard.
 * @param ctx - plugin root context.
 */
export function apply(ctx) {
  /** agent -> planMode service, or null once resolution was proven empty. */
  const resolved = new WeakMap()
  /** Agents already warned about, so a resolution failure is not silent. */
  const warned = new WeakSet()

  /**
   * Resolve an agent's planMode service.
   *
   * Plan mode is composed inside an agent preset, not in the profile root, so the
   * retained-composition lookup comes first; the ordinary context lookup covers
   * deployments that mount it in the root or a plain scope instead.
   * @param agent - the agent whose composition to inspect.
   * @returns the service, or null when this agent has no plan mode.
   */
  const planModeOf = (agent) => {
    const cached = resolved.get(agent)
    if (cached !== undefined) return cached
    let found = null
    try {
      found = ctx.agentPresets.serviceFor(agent, 'planMode') ?? null
    } catch {
      found = null
    }
    if (found === null) {
      try {
        found = agent.ctx?.get?.('planMode') ?? null
      } catch {
        found = null
      }
    }
    resolved.set(agent, found)
    return found
  }

  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        if (!BLOCKED_TOOLS.has(exec.name)) return undefined
        if (exec.agent === undefined) return undefined
        try {
          const agent = ctx.agents.get(exec.agent.id)
          if (agent === undefined) return undefined
          const planMode = planModeOf(agent)
          if (planMode === null) {
            if (!warned.has(agent)) {
              warned.add(agent)
              console.warn(
                'plan-build-mode: cannot resolve planMode for this agent; plan mode is not enforced',
              )
            }
            return undefined
          }
          if (planMode.get(agent).active !== true) return undefined
          return denial(exec.name)
        } catch {
          // A guard that throws fails the whole tool pipeline; never trade a
          // missing check for a broken session.
          return undefined
        }
      }),
    'plan-build-mode: plan guard',
  )
}
