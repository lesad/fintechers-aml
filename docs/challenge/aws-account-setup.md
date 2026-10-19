# AWS account setup and verified access

How we connect to the team AWS account, and what was checked against it on 2026-10-19. The organisers' own instructions are in [aws-participant-guide.md](aws-participant-guide.md); this file is our working setup on top of them.

## One-time setup per teammate

1. Sign in once in the browser through the access portal (link in the guide's quick reference): registered email, one-time code from the inbox, then an authenticator app. Choose the team account with the role `ai-hackathon-TeamAdmin`. Set the console region to Frankfurt.
2. `aws configure sso` with: session name `hackathon`, the access portal URL, SSO region `eu-north-1` (not Frankfurt), default region `eu-central-1`, output `json`. "No instances found" means the SSO region was entered wrong.
3. Add a profile named `hackathon` to `~/.aws/config`, next to (not replacing) `[default]`:

   ```ini
   [profile hackathon]
   sso_session = hackathon
   sso_account_id = <team-account-id>
   sso_role_name = ai-hackathon-TeamAdmin
   region = eu-central-1
   output = json
   ```

   The team account id is in the profile `aws configure sso` created, or in the access portal.

## Every day

- Sign in: `aws sso login --profile hackathon`. Sessions last 12 hours; sign in again overnight.
- Switch the shell to the team account: `export AWS_PROFILE=hackathon` (fish: `set -gx AWS_PROFILE hackathon`; back to default with `set -e AWS_PROFILE`). The AWS CLI has no config setting that redirects `default`, so switching always goes through `AWS_PROFILE` or `--profile`.
- Check: `aws sts get-caller-identity` shows the `ai-hackathon-TeamAdmin` role.
- Data: in the app repo, `pnpm data:pull` syncs `CNB/` and `MostlyRIght/` and the ČNB FX file into the git-ignored `data/raw/`.
- Spend: `aws ce get-cost-and-usage --region us-east-1 --time-period Start=2026-10-01,End=2026-10-21 --granularity MONTHLY --metrics UnblendedCost --query 'ResultsByTime[0].Total.UnblendedCost.Amount' --output text`. Figures lag up to 24 hours.

## Access verified on 2026-10-19

Read-only calls plus a few tiny model calls, from Adrian's laptop with the `hackathon` profile.

| Check                                                                                                                | Result                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                                                                                                             | Team account, role `ai-hackathon-TeamAdmin`                                                                                                                                                        |
| Shared dataset bucket                                                                                                | Lists `CNB/`, `MerchantKYB/`, `MostlyRIght/`                                                                                                                                                       |
| Bedrock inference profiles in Frankfurt                                                                              | 55                                                                                                                                                                                                 |
| `openai.gpt-oss-120b-1:0`                                                                                            | ACTIVE. Plain answer in 291 ms. The reply has a `reasoningContent` block before the `text` block, so code reads the text block, not the first one.                                                 |
| gpt-oss forced tool call (typed decision)                                                                            | Works, 3.6 s. Returned `{"triage":"REVIEW","severity":8,"reason_codes":["PEP","HIGH_AMOUNT","CROSS_BORDER"]}`. Severity 8 on an intended 1 to 5 scale: schemas don't enforce ranges, so code must. |
| `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`                                                                       | Works, 1.2 s                                                                                                                                                                                       |
| `eu.anthropic.claude-haiku-4-5-20251001-v1:0`                                                                        | Still `ServiceUnavailableException` on the second check (2026-10-19). The global profile `global.anthropic.claude-haiku-4-5-20251001-v1:0` works, but routes requests outside the EU.              |
| `eu.anthropic.claude-opus-4-5-20251101-v1:0`                                                                         | Works                                                                                                                                                                                              |
| Claude models listed in Frankfurt                                                                                    | Every generation from Claude 3 to Opus 5.5 and Fable 5.1 has an `eu.` or `global.` profile. Sonnet 4.5 is marked LEGACY in the model catalogue but still answers.                                  |
| Claude 4.5 quotas (requests per minute, EU and global profiles alike)                                                | Haiku 4.5: 50. Sonnet 4.5: 50 (1M-context variant: 1). Opus 4.5: 25.                                                                                                                               |
| Automated Reasoning policies, Guardrails, Knowledge Bases, AgentCore runtimes, Lambda, IAM roles, IAM OIDC providers | All listable (none exist yet)                                                                                                                                                                      |
| Cost Explorer (us-east-1, CLI only)                                                                                  | Works; spend so far about USD 0.001                                                                                                                                                                |
| Listing Bedrock in us-east-1                                                                                         | Not blocked for list calls; the guide's region block applies to creating resources                                                                                                                 |

Not tested on purpose: creating anything. Whether an IAM role or a Vercel OIDC provider can be created shows only when we create one.

## For app code

- Region in code: `eu-central-1`. Other regions are blocked for resources.
- Locally the AWS SDK finds credentials through `AWS_PROFILE`. On Vercel there is no profile and no access keys (blocked): credentials come from an IAM role, through Vercel OIDC federation or a Lambda that Vercel calls.
- Rate limits: gpt-oss-120b effectively unlimited; Claude models 50 requests/min shared by the team (25 on Opus).

## Claude for generated text (2026-10-19)

We have credits for the 4.5-generation Claude models (the team's statement; the credit terms aren't recorded here). Claude only writes text in our design, starting with the audit log summary; it never decides ([decision-architecture.md](decision-architecture.md)).

- **Decided: `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` is the default for all runtime generative AI**, starting with the per-alert story and the daily digest. It stays in the EU, has 50 requests/min and a 200K context. Generate per-alert stories when an analyst opens the alert, not for every alert in the batch, so the rate limit doesn't bind.
- **Haiku 4.5** only through the global profile while the EU one fails. Acceptable for synthetic data, but the EU-only story is easier to defend to the jury.
- **Opus 4.5** is not needed for summaries, and it has half the quota.
- Sonnet 4.5 is LEGACY on Bedrock: fine for the hackathon; a product would move to a current model.
