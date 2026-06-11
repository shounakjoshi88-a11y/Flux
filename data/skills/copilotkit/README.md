# CopilotKit Skills for AI Agents

> [!IMPORTANT]
> **This repository has moved.** CopilotKit skills now live in the main [CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit) monorepo, under [`skills/`](https://github.com/CopilotKit/CopilotKit/tree/main/skills). Install from there going forward — this standalone repo is no longer the source of truth.

Skills, hooks, MCP configuration, and reference docs that teach AI coding agents how to build with CopilotKit. Covers project setup, feature development, integration wiring, debugging, version migration, and open-source contribution — all targeting the v2 API surface (`@copilotkit/*`).

Built on the open [Agent Skills](https://agentskills.io) standard. One set of SKILL.md files works across Claude Code, Codex, Cursor, and OpenCode.

## Installation

Install the skills directly from the monorepo:

```bash
npx skills add CopilotKit/CopilotKit/skills -y
```

Fresh clones from GitHub every time. To **update**, run the same command again — it always gets the latest.

## Why the move?

Keeping the skills in the main monorepo means they live next to the code they describe: reference material is generated from the same tree, version bumps land in lockstep with releases, and there's a single place to file issues and PRs.

## Where things are now

| What | Where |
|------|-------|
| Skills source | [`CopilotKit/CopilotKit/skills/`](https://github.com/CopilotKit/CopilotKit/tree/main/skills) |
| Install command | `npx skills add CopilotKit/CopilotKit/skills -y` |
| Issues & PRs | [github.com/CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit) |
| Docs | [docs.copilotkit.ai](https://docs.copilotkit.ai) |
| Discord | [discord.gg/copilotkit](https://discord.gg/copilotkit) |
| Agent Skills standard | [agentskills.io](https://agentskills.io) |

## License

MIT License — see [LICENSE](LICENSE) for details.
