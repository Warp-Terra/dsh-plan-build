# dsh-plan-build-mode

[English](README.md) | 中文

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web 输入框里常驻一个 **构建** 控件，并用 <kbd>Tab</kbd> 在构建与计划模式之间切换 —— 这正是 OpenCode 有、而 harness 的计划模式缺的那半边；同时用一层工具守卫让计划模式真正变成只读，而不只是嘴上说说。

## 为什么

Harness 自带计划模式（`@deepseek-ai/dsh-plan-mode`）和输入框状态胶囊（`@deepseek-ai/dsh-client-ui-plan`），但后者只在计划模式 **激活时** 才渲染 —— 它自己的 README 就把"没有未激活状态下的计划控件"列为已知限制。于是进入计划模式只能靠输入 `/plan`、打开 `+` 命令菜单，或者干脆不进去；而一旦处于构建模式，输入框里没有任何模式标识。

而且它的计划模式只是 *引导，不是约束*：所有工具依然可调用，所以一份"待审批"的方案，可能是在模型已经改完文件之后才送上来的。没有这层守卫，批准计划就只是在给"模型暂时还没做的事"盖章。

本插件补上缺的这半边：

- 计划模式关闭时，在输入框工具行左侧显示中性的 **构建** 胶囊；
- 在输入框内按 <kbd>Tab</kbd> 可在 构建 → 计划 → 构建 之间循环，**草稿里有没有文字都切换**；
- 点击胶囊执行与 harness 相同的 `/plan` 命令；
- 计划模式开启时，`write` 与 `edit` 被拒绝，对齐 OpenCode 的 `permissions: deny edit *`。

计划模式开启时，访问模式控件旁那个官方蓝色 **计划** 胶囊仍是可见标识，两者不会同时出现。

## 行为

| 情形 | 你会看到 | <kbd>Tab</kbd> |
|---|---|---|
| 计划关闭 | 中性的 **构建** 胶囊 | 进入计划模式（`/plan`） |
| 计划开启 | harness 的蓝色 **计划** 胶囊 | 退出计划模式（`/plan off`） |
| 草稿有文字 | **构建** 胶囊 | 照常切换 —— 只由焦点位置决定 |
| 光标在输入框之外 | **构建** 胶囊 | 放行 |
| Shift/Alt/Ctrl/Cmd + Tab | — | 放行 |

计划模式状态来自 harness 自己的 `plan` 会话投影，并按官方胶囊相同的口径折叠（`pending ? !active : active`），因此"回合进行中请求切换"时，显示的是 harness 真正会采用的目标值。

## 安装

```sh
dsh plugin install /absolute/path/to/dsh-plan-build-mode
```

或者在 Harness 会话里让 agent 对本目录执行 `install_bundle`。插件只插入一行 `plan-build-mode`，不修改任何 harness 文件。

## 实现方式

- 客户端半边注册进 `conversation.input.left` 列表槽位（由 `ui-conversation` 声明，默认无占用，`replaceRisk: none`）。
- 状态读取用标准套件的 `useProjection('plan')`；切换走 `ctx.remote.commands.execute(sessionId, '/plan' | '/plan off', [])`，与官方胶囊同一条路径。
- <kbd>Tab</kbd> 是一个固定快捷键行（`ctx.shortcuts.registerFixed`），通过 `ctx.shortcuts.observeFixedInput` 观察；只有在输入框编辑区内才消费事件，其余位置照常移动焦点。
- Host 半边注册一个 `ctx.tools.guard`：agent 的计划模式激活时拒绝 `write` 与 `edit`，并给出指明下一步的理由；其它调用原样放行。

## 语言

胶囊上的每一处可见文案 —— 文字、`aria-label`、悬停提示、失败提示 —— 都经由客户端本地化服务，因此控件跟随的是**界面语言**（Settings → General → Language），而不是操作系统语言或对话语言。harness 内建 `zh` 与 `en`，`zh` 声明回落到 `en`；查找会先走本命名空间里的这条链路，取不到才会把原始 key 显示出来。切换语言后胶囊在下次渲染即更新，无需刷新页面，也无需重装插件。

通过 `addLanguage` 注册的第三方语言包在这里会回落到英文，因为我们只提供 `zh` 与 `en` 两套字典。

guard 的拒绝理由**有意不翻译**：它是模型可见内容，而 harness 的系统提示词是英文。

## 强制约束

Harness 的计划模式只靠提示词约束模型，所以一份"待审批"的方案，可能是在模型已经改过文件之后才到的。守卫让这个阶段变成真的：

```js
ctx.tools.guard((exec) => {
  if (!BLOCKED_TOOLS.has(exec.name)) return undefined   // 早退，只读调用零成本
  ...
  if (planMode.get(agent).active !== true) return undefined
  return denial(exec.name)
})
```

拦截范围对齐 OpenCode 的 `permissions: deny edit *` —— 也就是它的 `write`/`edit`/`patch` 三个工具。计划状态通过 agent 保留的 preset 组合实时读取（`agentPresets.serviceFor(agent, 'planMode')`，回退到 `agent.ctx.get('planMode')`），因此退出计划模式后写入立即恢复，无需重启、也无需重新注册。

guard 一旦抛错会失败整条工具管线，所以每一步解析都包了保护：解析不到计划模式的 agent 会被放行并告警一次，而不是被拦住或被搞崩。

## 限制

- **强制约束只覆盖文件编辑。** `write` 与 `edit` 被拒绝，shell 工具不拦 —— 这点对齐 OpenCode，它只 deny 了 `edit` 权限，`bash` 仍可调用，所以一条 shell 命令照样能写盘。从计划模式会话里派生的子代理是一个全新的 agent、计划模式为关闭，因此委托也能写入。真正要动手实现时，请先关掉计划模式。
- 胶囊只覆盖"相反的那一半状态"；要把计划与构建合并成一个常驻控件，就得遮蔽官方的 `conversation.input.plan` 槽位。
- Tab 是固定绑定，会出现在快捷键参考里但不可改键。它接管了输入框编辑区内的所有 <kbd>Tab</kbd>，无论有没有草稿；<kbd>Shift</kbd>+<kbd>Tab</kbd> 有意不拦，所以焦点仍可反向离开编辑区。
- 依赖随 harness 一同分发的 `ui-conversation` 与 `client-shortcuts` 两个客户端包。

## 许可

MIT
