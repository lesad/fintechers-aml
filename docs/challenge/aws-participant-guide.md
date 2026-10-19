# AWS Participant Guide (organisers, AWS and Deloitte)

Extracted on 2026-10-19 from the Notion page "AWS Participant Guide: your AWS account, start to finish", linked from the Track 5 page. Block-by-block text below; the access portal URL and the dataset bucket's account id are replaced with placeholders and are in the guide's quick reference.

## What it changes for us

- **No IAM users or access keys.** Blocked at account level. Running code uses an IAM role (allowed). Temporary keys from the access portal expire with the 12-hour session. So Vercel can't hold long-lived Bedrock keys: either federate Vercel to an IAM role through OIDC (not yet checked against the guardrails), or put the Bedrock-calling backend on AWS (Lambda with a role) and let Vercel call it.
- **Budget:** USD 800 per team, shared. Alerts go to the organisers; nothing cuts off.
- **Models:** model access is already enabled. `openai.gpt-oss-120b-1:0` needs no prefix and has effectively unlimited throughput (100M tokens/min). Claude runs only through `eu.` profiles: Haiku 4.5, Sonnet 4.5, Opus 4.5, at 50 requests/min shared (25 on Opus). Claude 5 is not available.
- **No GPU instances.** CPU only: t3, t4g, m6i.large and .xlarge, m7g.large and .xlarge, c6i.large, c7g.large. Laya runs on CPU, so a later migration stays possible.
- **Knowledge Bases and vector stores are open.** OpenSearch Serverless costs about USD 23 a day even idle; a provisioned t3.small.search domain about USD 1 a day.
- **Region:** build everything in eu-central-1. The SSO region for the CLI is eu-north-1. Cost Explorer works only over the CLI in us-east-1.
- **Accounts freeze after the event.** Push code somewhere we own.
- **MoroSystems TSYS API** with docs at tsys-docs.morosystems.cloud; demo key at onboarding.

## Guide text

page: AWS Participant Guide: your AWS account, start to finish
callout:
text: Must-read for every hacker. Prepared by AWS and Deloitte. Every team gets its own AWS account with Amazon Bedrock, a USD 800 budget and admin rights inside it. This page covers signing in, calling models from code, watching your spend, and the four things that are deliberately blocked. Bring a phone: multi-factor authentication is required.
sub_header: ⚡ Quick reference
table:
row: <access-portal-url> | Access portal
row: eu-central-1 (Frankfurt) | Build everything in
row: eu-north-1 (Nova Sonic) | Voice models only
row: eu-north-1 ← deliberately different | SSO region for the CLI
row: ai-hackathon-TeamAdmin | Your role
row: 12 hours | Session length
row: USD 800, shared across your team | Team budget
row: s3://ai-hackathon-datasets-<aws-account-id>/ | Shared datasets
sub_header: 🔑 Signing in the first time
numbered_list: Open the portal and enter your email. Use the address you registered with. There is no password to find; you have never been given one.
numbered_list: Collect the one-time code from your inbox. Your first sign-in attempt triggers the email, so nothing is waiting before that. The code is short-lived; if you leave it an hour, start again.
numbered_list: Register an authenticator app. Scan the QR code with Google Authenticator, 1Password, Authy or similar. You need it every time you sign in, so use a device you have at the venue.
numbered_list: Choose your account and role. You see your team's account with ai-hackathon-TeamAdmin, plus read-only access to a shared account with datasets. Pick TeamAdmin.
callout:
text: Set your region immediately. The console remembers the last region you used, and the region selector is the most common cause of mysterious permission errors. Set Europe (Frankfurt) eu-central-1 before you create anything.
sub_header: 💻 Working from the command line
text: There are no access keys in this environment. The CLI works through SSO, which gives short-lived credentials that refresh with one command.
text: One-time setup: run aws configure sso and answer:
table:
row: Prompt | Answer
row: SSO session name | hackathon
row: SSO start URL | <access-portal-url>
row: SSO region | eu-north-1 (where sign-in lives)
row: SSO registration scopes | accept the default
row: CLI default client region | eu-central-1 (where your work lives)
row: CLI default output format | json
callout:
text: "No instances found"? You entered eu-central-1 as the SSO region. It is eu-north-1: you build in Frankfurt, but the sign-in directory lives in Stockholm.
text: Every day after that:
code: aws sso login --profile hackathon
aws sts get-caller-identity # confirms which account you are in
text: Sessions last 12 hours, so run aws sso login about once a day, including once during the overnight stretch.
text: Faster for one-off commands: in the access portal, next to your account, choose Access keys to get temporary credentials for your shell. They expire with your session.
callout:
text: For anything long-running, use an IAM role. Pasted credentials expire and break running services. Give Lambda, ECS and EC2 an IAM role instead (creating roles is allowed). If you are about to commit a secret, attach a role.
sub_header: 🤖 Calling models on Bedrock
text: Model access is already enabled. Nothing to request.
sub_sub_header: Claude
text: In Europe, Claude runs through EU cross-region inference profiles, so the model ID needs the eu. prefix. A bare anthropic.claude-… ID will not work. Prices per million tokens (input / output). Rate limits are shared across your team.
table:
row: Model ID | Requests/min | In / out | Tokens/min
row: eu.anthropic.claude-haiku-4-5-20251001-v1:0 | 50 | USD 1.10 / 5.50 | 5M
row: eu.anthropic.claude-sonnet-4-5-20250929-v1:0 | 50 | USD 3.30 / 16.50 | 5M
row: eu.anthropic.claude-opus-4-5-20251101-v1:0 | 25 | USD 5.50 / 27.50 | 2M
callout:
text: Claude 5 is not available, don't lose time on it. Sonnet 5, Opus 5 and Sonnet 5.5 have no capacity in this region and return "AccessDeniedException … not available for this account". A mentor cannot switch this on. Use Sonnet 4.5 or Opus 4.5.
sub_sub_header: Everything else
text: No prefix needed, effectively unlimited throughput (100M tokens/min), good for high-volume loops and evaluation runs: qwen.qwen3-235b-a22b-2507-v1:0, qwen.qwen3-32b-v1:0, qwen.qwen3-coder-30b-a3b-v1:0, zai.glm-4.7-flash, nvidia.nemotron-super-3-120b, mistral.devstral-2-123b, minimax.minimax-m2.5, openai.gpt-oss-120b-1:0, openai.gpt-oss-20b-1:0.
text: Amazon Nova and Pixtral use EU profiles with lower limits: eu.amazon.nova-2-lite-v1:0 (8M), eu.amazon.nova-pro-v1:0 (2M), eu.amazon.nova-micro-v1:0 and eu.amazon.nova-lite-v1:0 (400K), eu.mistral.pixtral-large-2502-v1:0 (80K).
sub_sub_header: Voice: Nova Sonic, the one exception to Frankfurt
text: Speech-to-speech models are only in Stockholm: amazon.nova-2-sonic-v1:0 (speech in, speech + text out) and amazon.nova-2-5-sonic (speech + text in, speech + text out), both with --region eu-north-1. They use the bidirectional streaming API (InvokeModelWithBidirectionalStream), not Converse.
callout:
text: Keep your data in Frankfurt. Only the model call goes to Stockholm. S3 buckets, Lambdas and everything else stay in eu-central-1. Transcribe and Polly are blocked in eu-north-1; if you want Transcribe, run it in eu-central-1.
sub_sub_header: A first call
code: aws bedrock-runtime converse \
 --region eu-central-1 \
 --model-id eu.anthropic.claude-sonnet-4-5-20250929-v1:0 \
 --messages '[{"role":"user","content":[{"text":"Say hello"}]}]' \
 --inference-config '{"maxTokens":100}'
text: In Python: boto3.client("bedrock-runtime", region_name="eu-central-1") and the same converse call. To see everything available: aws bedrock list-inference-profiles --region eu-central-1.
callout:
text: Prompt caching is the cheapest optimisation you will make. Cached input tokens cost ten times less (USD 0.33 vs 3.30 per million on Sonnet 4.5). If your agent resends the same system prompt or document every turn, cache it.
sub_header: 🗂️ Shared datasets
text: Everything the track owners hand over is in one bucket, readable from your own account (no extra credentials, no account switching):
code: aws s3 ls s3://ai-hackathon-datasets-<aws-account-id>/ --region eu-central-1
text: The bucket is read-only on purpose: nobody can alter a dataset other teams are judged on. Copy what you need into your own account.
table:
row: Best for | Folder | What is in it
row: Track 5 (AML challenges) | CNB/ | Synthetic AML data. clients.csv (5,493 rows, 12 columns: contract date and channel, PEP flag, client type, expected vs actual volume and count for 2Q2026, AML risk score low/medium/high) and transactions.csv (397,853 rows, 11 columns, joins on client ID). Semicolon-delimited, UTF-8 with BOM. No real names or accounts
row: Track 4 (Tapaya KYB challenge) | MerchantKYB/ | Eight PDFs: merchant application forms A and B, partner application, UBO declaration and checklist, short-form merchant agreement. Pair with Required-Documents-Checklist.pdf for a completeness check
row: Tracks 1, 4, 5 | MostlyRIght/ | EU financial firm licences and warnings: ČNB and ESMA MiCA licence registers, EPC SEPA Instant and Verification of Payee participants, AMF and ESMA warnings, EU sanctions (entities only)
code: import pandas as pd
clients = pd.read_csv("clients.csv", sep=";")
txns = pd.read_csv("transactions.csv", sep=";")
df = txns.merge(clients, on="client ID")
text: MoroSystems TSYS API: an external payments API with its own documentation portal (https://tsys-docs.morosystems.cloud) and API (https://tsys-api.morosystems.cloud), for teams that want a live integration target. A shared demo key is issued for this event; you get the login and API key at tech onboarding and on Circle. Read the portal before guessing at endpoints.
sub_header: 💰 Watching your spend
text: Your team has USD 800, shared across everyone in your account. Nothing cuts you off: the budget alerts the organisers, it does not stop you.
callout:
text: The billing console will not open, use the CLI. Cost Explorer in the browser is switched off at account level, so don't ask for permissions. The data is available over the API (in us-east-1, the one exception to Frankfurt):
code: # What have we spent?
aws ce get-cost-and-usage --region us-east-1 \
 --time-period Start=2026-10-01,End=2026-10-21 \
 --granularity MONTHLY --metrics UnblendedCost \
 --query 'ResultsByTime[0].Total.UnblendedCost.Amount' --output text

# Which model is eating the budget?

aws ce get-cost-and-usage --region us-east-1 \
 --time-period Start=2026-10-01,End=2026-10-21 \
 --granularity MONTHLY --metrics UnblendedCost \
 --group-by Type=DIMENSION,Key=SERVICE \
 --query 'ResultsByTime[0].Groups[?Metrics.UnblendedCost.Amount!=`0`].[Keys[0],Metrics.UnblendedCost.Amount]' \
 --output table
bulleted_list: You only see your own account. No team sees another's spend.
bulleted_list: Figures lag by up to 24 hours. It is a review tool, not a live meter.
bulleted_list: Amounts under a cent show as 0. On day one it looks like nothing is recorded; it is.
bulleted_list: Output tokens dominate. Draft with Haiku and escalate to Opus only where it matters.
sub_header: 🚧 What's blocked, and why
text: Guardrails are enforced at account level, so an error is final. There is no local workaround.
numbered_list: Regions other than Frankfurt. Everything you create lives in eu-central-1. A tutorial that says us-east-1 needs changing.
numbered_list: IAM users and access keys. Long-lived keys leaked in public repos are the classic hackathon incident. Use IAM roles instead (allowed).
numbered_list: Large and GPU instances. Available: t3., t4g., m6i.large, m6i.xlarge, m7g.large, m7g.xlarge, c6i.large, c7g.large. Inference runs on Bedrock, so no GPU is needed; talk to a mentor first if you think you need one.
numbered_list: Services that bill while idle. Reserved instances, capacity reservations, savings plans, dedicated hosts, Redshift, MSK/Kafka, EMR, Outposts, Snowball, Braket, domain registration and Shield Advanced are unavailable.
callout:
text: Vector stores are open, with one cost trap. OpenSearch, RDS with pgvector and Bedrock Knowledge Bases are available. A provisioned t3.small.search OpenSearch domain costs about USD 1 a day; OpenSearch Serverless costs about USD 23 a day whether you query it or not. Pick provisioned, and delete it before you leave.
sub_header: 🛠️ When something fails
table:
row: What you see | What it means | Fix
row: "explicit deny in a service control policy", ARN shows a region other than eu-central-1 | Console or CLI pointed at the wrong region | You: switch to Frankfurt and retry
row: "explicit deny in a service control policy", ARN says eu-central-1 | A gap in the guardrails, not your mistake | Organiser: report it with the full message
row: "no instances found" during aws configure sso | SSO region entered as eu-central-1 | You: it is eu-north-1
row: "not available for this account" on a Claude 5 model | No capacity in Europe | You: use Sonnet 4.5 or Opus 4.5
row: ValidationException on anthropic.claude-… | Missing the EU profile prefix | You: prepend eu.
row: ThrottlingException | Team hit the shared limit (50 requests/min, 25 on Opus) | You: back off, stagger jobs, move bulk work to Qwen or Nova
row: Cannot create an access key | Blocked by design | You: aws sso login, or a role for running code
row: Credentials stopped working | The 12-hour session ended | You: aws sso login again
row: Cost Explorer shows 0 | Sub-cent rounding or the 24-hour lag | You: normal, check later
text: When you ask for help, paste the complete error message: the region in the ARN and the exact action name make it diagnosable in seconds.
sub_header: 🏁 Before you leave
bulleted_list: Push your code somewhere you own. Accounts are frozen after the event; you keep read access to export, but don't rely on it.
bulleted_list: Delete anything that bills while idle: OpenSearch domains and collections, RDS instances, load balancers, NAT gateways. Freezing stops new resources, not the meter on existing ones.
bulleted_list: Submission: a repo link by the code freeze, Tuesday 20 October at 13:30 (see Submission and judging in the hackers guide). No video or one-pager is required for the main judging.
