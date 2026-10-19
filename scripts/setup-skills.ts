import { execSync } from "node:child_process";

// Format: "owner/repo/skill-name" (3 parts) or "owner/repo" (2 parts = whole repo)
// Generic skills — apply to all projects, install user-scoped (-g)
const USER_SKILLS = [
  "anthropics/skills/frontend-design",
  "vercel-labs/agent-skills/web-design-guidelines",
] as const;

// Stack-specific skills — only relevant here, install project-scoped (no -g)
const PROJECT_SKILLS = [
  // dex — live task memory. Install only the `dex` skill; the repo's `dex-plan`
  // is Critical-flagged and unused here, so the 3-part form skips it (no prune needed).
  "dcramer/dex/dex",
  "vercel-labs/next-skills/next-best-practices",
  "wshobson/agents/tailwind-design-system",
  "vercel-labs/agent-skills/vercel-react-best-practices",
  "shadcn/ui/shadcn",
] as const;

function skillCmd(path: string, global: boolean): string {
  const parts = path.split("/");
  const repo = parts.slice(0, 2).join("/");
  const skillFlag = parts.length >= 3 ? `--skill ${parts[2]}` : "";
  const globalFlag = global ? "-g" : "";
  return `pnpm dlx skills add ${repo} ${skillFlag} --agent claude-code -y ${globalFlag}`
    .replace(/\s+/g, " ")
    .trim();
}

function run(cmd: string) {
  console.log(`→ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

console.log("Installing user-scoped skills (generic, ~/.claude/skills/)...");
for (const skill of USER_SKILLS) {
  try {
    run(skillCmd(skill, true));
  } catch (err) {
    console.error(`! failed to install ${skill}:`, err);
  }
}

console.log("\nInstalling project-scoped skills (.claude/skills/)...");
for (const skill of PROJECT_SKILLS) {
  try {
    run(skillCmd(skill, false));
  } catch (err) {
    console.error(`! failed to install ${skill}:`, err);
  }
}

console.log("\nFallow MCP ships with the npm `fallow` package — no extra install needed.");
console.log("\n✓ done. Restart Claude Code to pick up new MCPs.");
