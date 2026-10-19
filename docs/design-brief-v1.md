> Superseded by the saved Claude Design export in `docs/design/` (see its README). Kept for history; the stack line below predates ADR-0025 and ADR-0028.

# Design brief v1: AML review overview

Brief for Claude Design. We design the app step by step. This step is **one page only: the overview of transactions waiting for human AML review.** Keep it simple; we build on it.

## Context

Transactions land in our database and an automated AML check rates them. Risky ones go to human review. Each flagged transaction has two ratings:

- **Rule rating** (Low / Medium / High + one-line reason). This is what sent it to review. It leads.
- **AI rating** (Low / Medium / High + one-line summary). Only a helper for the reviewer. Visibly secondary, labelled as AI.

The user is an AML analyst who works through this list all day: scan, pick, open, decide.

## The page

A table of flagged transactions. Per row:

- rule rating with its one-line reason
- AI rating (smaller), and a marker when it disagrees with the rule rating
- transaction id, client id, amount in CZK, date and time
- status: New, In review, Escalated, Closed
- time since flagged

Above the table: simple filters (rating, status) and a search by transaction or client id. Default sort: rule rating, then oldest first.

## Tabs

Clicking a row opens the transaction detail in a **new tab inside the app** (a tab bar under the header, like a browser or an IDE). The overview stays as the first, fixed tab; detail tabs can be closed.

For this step, design only the tab bar and an empty detail tab with a placeholder. The detail content comes in a later step. Later we may let users split tabs side by side, so don't make the tab bar block that, but don't design it now.

## Look and feel

- Data-heavy work tool: tight spacing, compact rows (about 32 px), small gaps, text 13 to 14 px, numbers right-aligned.
- Few colours; colour reserved for the risk rating, always with a text label too.
- Desktop first (1440 px wide), light and dark theme.

## Technical frame

Next.js, Tailwind CSS v4, shadcn/ui components (Table, Tabs, Badge, Input, Select). UI in English.

## Sample data

Synthetic data, nothing real. Ids look like `TX000000001` (transaction) and `K003797` (client). Amounts in CZK. Mock about 12 rows with a mix of ratings and statuses, including one where the AI rating is still running and one where AI and rule disagree.

## Not in this step

Transaction detail content, visualisations, decision actions, split view, saving layouts or tabs, user settings.
