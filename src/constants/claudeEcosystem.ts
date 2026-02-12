export interface EcosystemCatalogItem {
  id: string
  name: string
  description: string
  sourceLabel: string
  sourceUrl?: string
  installCommand?: string
  tags?: string[]
  official?: boolean
  recommended?: boolean
}

export const SKILL_CATALOG_ITEMS: EcosystemCatalogItem[] = [
  {
    id: 'skills-docs',
    name: 'Claude Code Skills 文档',
    description: '官方 Skills 规范，覆盖 frontmatter、触发策略、共享方式与最佳实践。',
    sourceLabel: 'Anthropic Docs',
    sourceUrl: 'https://code.claude.com/docs/en/skills',
    tags: ['skills', 'official', 'docs'],
    official: true
  },
  {
    id: 'skills-official-repo',
    name: 'anthropics/skills',
    description: '官方公开 Skill 示例仓库，可直接参考或拷贝到本地 skills 目录。',
    sourceLabel: 'GitHub',
    sourceUrl: 'https://github.com/anthropics/skills',
    tags: ['skills', 'official', 'examples'],
    official: true
  },
  {
    id: 'skills-open-standard',
    name: 'Agent Skills Open Standard',
    description: '跨工具通用的 Skills 开放标准，用于设计可迁移的 Skill 能力。',
    sourceLabel: 'agentskills.io',
    sourceUrl: 'https://agentskills.io',
    tags: ['skills', 'standard'],
    recommended: true
  },
  {
    id: 'skills-community-examples',
    name: 'anthropic_skills 社区集合',
    description: '社区维护的 Skill 示例集合，适合快速借鉴第三方能力模板。',
    sourceLabel: 'GitHub',
    sourceUrl: 'https://github.com/CraigBasson/anthropic_skills',
    tags: ['skills', 'community', 'third-party']
  }
]

export const PLUGIN_CATALOG_ITEMS: EcosystemCatalogItem[] = [
  {
    id: 'plugin-discover-docs',
    name: '插件发现与安装文档',
    description: '官方插件安装/管理入口，包含官方与第三方 marketplace 的使用方式。',
    sourceLabel: 'Anthropic Docs',
    sourceUrl: 'https://code.claude.com/docs/en/discover-plugins',
    tags: ['plugins', 'official', 'docs'],
    official: true
  },
  {
    id: 'plugin-official-marketplace',
    name: 'claude-plugins-official 官方市场',
    description: '官方维护的插件市场，支持直接安装预构建插件。',
    sourceLabel: 'GitHub',
    sourceUrl: 'https://github.com/anthropics/claude-plugins-official',
    installCommand: '/plugin install <plugin-name>@claude-plugins-official',
    tags: ['plugins', 'official', 'marketplace'],
    official: true
  },
  {
    id: 'plugin-demo-marketplace',
    name: 'anthropics/claude-code 示例市场',
    description: '官方示例 marketplace，包含 commit-commands 等常用插件样例。',
    sourceLabel: 'GitHub',
    sourceUrl: 'https://github.com/anthropics/claude-code/tree/main/plugins',
    installCommand: '/plugin marketplace add anthropics/claude-code',
    tags: ['plugins', 'official', 'demo'],
    official: true
  },
  {
    id: 'plugin-github',
    name: 'github 插件',
    description: '官方市场常用插件，提供 GitHub 集成能力。',
    sourceLabel: 'Official Marketplace',
    installCommand: '/plugin install github@claude-plugins-official',
    tags: ['plugins', 'integration', 'github'],
    recommended: true
  },
  {
    id: 'plugin-figma',
    name: 'figma 插件',
    description: '官方市场常用插件，提供设计稿与代码协作能力。',
    sourceLabel: 'Official Marketplace',
    installCommand: '/plugin install figma@claude-plugins-official',
    tags: ['plugins', 'design', 'figma'],
    recommended: true
  },
  {
    id: 'plugin-vercel',
    name: 'vercel 插件',
    description: '官方市场常用插件，适用于部署和基础运维流程。',
    sourceLabel: 'Official Marketplace',
    installCommand: '/plugin install vercel@claude-plugins-official',
    tags: ['plugins', 'deploy', 'vercel'],
    recommended: true
  },
  {
    id: 'plugin-custom-marketplace',
    name: '自建第三方 Marketplace',
    description: '官方支持团队/社区自建 marketplace，便于分发第三方插件。',
    sourceLabel: 'Anthropic Docs',
    sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/plugin-marketplaces',
    installCommand: '/plugin marketplace add <owner/repo|git-url|local-path>',
    tags: ['plugins', 'third-party', 'marketplace']
  }
]

export const HOOK_CATALOG_ITEMS: EcosystemCatalogItem[] = [
  {
    id: 'hooks-docs',
    name: 'Claude Code Hooks 文档',
    description: '官方 Hook 生命周期和配置规范，可直接用于本地 settings.json 配置。',
    sourceLabel: 'Anthropic Docs',
    sourceUrl: 'https://code.claude.com/docs/en/hooks-guide',
    tags: ['hooks', 'official', 'docs'],
    official: true
  },
  {
    id: 'hooks-in-skills',
    name: 'Skills / Agents 中的 Hooks',
    description: '官方支持在 Skill frontmatter 中挂载 hooks，实现能力级自动化。',
    sourceLabel: 'Anthropic Docs',
    sourceUrl: 'https://code.claude.com/docs/en/hooks#hooks-in-skills-and-agents',
    tags: ['hooks', 'skills', 'official'],
    official: true
  },
  {
    id: 'hooks-security-template',
    name: '安全审查 Hook 模板',
    description: '推荐在 PostToolUse 针对 Write/Edit/Bash 增加安全检查，降低误操作风险。',
    sourceLabel: 'Best Practice',
    tags: ['hooks', 'security', 'template'],
    recommended: true
  },
  {
    id: 'hooks-quality-template',
    name: '质量闸门 Hook 模板',
    description: '推荐在 Stop/SubagentStop 前执行 lint/test，保证输出质量和可回归。',
    sourceLabel: 'Best Practice',
    tags: ['hooks', 'quality', 'template'],
    recommended: true
  },
  {
    id: 'hooks-community-index',
    name: 'Hooks 社区案例索引',
    description: '通过 GitHub 主题页快速查看社区 Hook 相关实践与脚本样例。',
    sourceLabel: 'GitHub',
    sourceUrl: 'https://github.com/topics/claude-code',
    tags: ['hooks', 'community', 'third-party']
  }
]
