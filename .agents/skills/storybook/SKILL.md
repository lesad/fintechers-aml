---
name: storybook
description: >
  Use Storybook as the living documentation of the component library and app.
  ALWAYS use this skill when adding or editing a Storybook story (*.stories.tsx),
  writing MDX doc pages, deciding the sidebar taxonomy (Guides/Primitives/
  Components/Core), transcluding docs/ markdown into Storybook, or when an agent
  needs to QUERY component docs (list components, look up props/variants, get a
  preview URL) via the Storybook MCP — even if the word "Storybook" isn't used.
  Encodes the authoring conventions AND the MCP consumption workflow.
---

# Storybook — living documentation

Storybook doubles as living documentation: component stories + MDX docs,
queryable by agents through the Storybook MCP. Run it with `pnpm storybook`
(→ :6006).

## Taxonomy (order enforced by `storySort`)

Every story/doc `title` is `"<Bucket>/<Name>"`. Order: **Guides → Primitives →
Components → Core**.

| Bucket         | What goes here                                            | How                          |
| -------------- | --------------------------------------------------------- | ---------------------------- |
| **Guides**     | project docs (Getting Started, Architecture, Conventions) | MDX transcluding `docs/*.md` |
| **Primitives** | Base-UI-derived atoms (Button, Input, Badge)              | co-located `*.stories.tsx`   |
| **Components** | composed/domain components                                | co-located `*.stories.tsx`   |
| **Core**       | pure domain-logic docs (+ live demos)                     | MDX                          |

- Stories co-locate with the component in `src/components/`.
- MDX docs live in `src/docs/`.

## Authoring — component story

Template: **`src/components/ui/button.stories.tsx`**. A fully-fledged story is
CSF3 (`satisfies Meta<typeof X>`) with: `Default` (+ a `play` interaction from
`storybook/test` where useful), one story per meaningful axis (e.g. `Variants`,
`Sizes`), and `tags: ["autodocs"]`.

- Title bucket = the component's layer: **Primitives** (bare Base-UI-derived) vs
  **Components** (composed/domain).
- **Controls are core** — SB 9+ folded controls/actions/viewport/toolbars into
  core Storybook (no install, no `addons` entry). Drive them with `argTypes` per
  story; `@storybook/addon-docs` renders the `<Controls />` prop table in
  autodocs. Do **not** add `@storybook/addon-controls` (redundant in SB10).
- Interactive elements need a `testId` — type props with `WithRequiredTestId`
  from `@/test/ids` and pass `testId` (see `src/core/test/ids/`).
- Style only with semantic token classes (see the shadcn skill + CLAUDE.md) so
  theming works; never hardcode hex/oklch.

## Authoring — MDX doc page (transclude docs/)

`docs/` is the single source of truth. A doc page renders it inline via a Vite
`?raw` import + the `<Markdown>` block, then links back to the canonical file.

Template: **`src/docs/getting-started.mdx`**

```mdx
import { Meta, Markdown } from "@storybook/addon-docs/blocks";
import md from "../../docs/README.md?raw";

<Meta title="Guides/Getting Started" />

<Markdown>{md}</Markdown>

---

📄 **Full source (canonical):** `docs/README.md`
```

Rules:

- **Curated, not mirrored** — transclude focused docs only. Never transclude huge
  files (e.g. `DECISIONS.md`) or image-heavy pages.
- Relative links/images inside the markdown **won't resolve** in Storybook —
  always add the "Full source →" line pointing at the canonical path.
- The `?raw` path is relative to the MDX file (from `src/docs/`, repo root is
  `../../`).

## Config

- **Do NOT set `server.fs.allow`.** Storybook's default allow-list is the project
  root, which already serves both `src/` (stories + MDX) **and** `docs/`
  (transclusion). Setting `fs.allow` explicitly _replaces_ the default and drops
  paths, so every story/MDX 403s (`Failed to fetch dynamically imported module`).
  `fs.allow` is a security scope, not a perf/HMR control — narrowing it buys
  nothing and breaks Storybook.
- `.storybook/preview.ts`: `options.storySort.order = ["Guides","Primitives","Components","Core"]`.

## Consuming — use the docs as an agent (Storybook MCP)

`@storybook/addon-mcp` serves an MCP at `http://localhost:6006/mcp` (needs
`pnpm storybook` running, else 404). It is wired in `.mcp.json`. Prefer these
over grepping source for component facts:

| Task                                   | Tool                                                |
| -------------------------------------- | --------------------------------------------------- |
| List all components + story IDs        | `list-all-documentation` (`withStoryIds: true`)     |
| Props / variants / API of a component  | `get-documentation` (`id`)                          |
| Preview a component in a state / theme | `preview-stories` (`storyId` + `props` / `globals`) |
| More examples of a specific variant    | `get-documentation-for-story`                       |
| **Before** writing/editing any story   | `get-storybook-story-instructions`                  |

- Don't hallucinate props — `get-documentation` returns real prop types + usage.
- Surface any `preview-stories` URL in your reply so the human can open it.
- Only reference IDs returned by `list-all-documentation`.

## Verify your changes

- `pnpm storybook:build` — all stories + MDX must compile.
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check`.
- Via MCP `list-all-documentation`: the new story/doc appears under the right
  bucket; transcluded pages render their content.
