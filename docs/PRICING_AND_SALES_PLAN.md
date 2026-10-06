# TGReposter Pricing & Sales Plan

**Status:** Approved commercial baseline for product and billing development  
**Version:** 1.0  
**Date:** 2026-10-06  
**Product:** TGReposter — Telegram Content Operations Platform

---

## 1. Purpose

This document records the approved commercial direction for TGReposter and converts the pricing and sales decisions into a durable product specification for future development.

It should be used by product, engineering, marketing, billing, and sales work as the current baseline until a later decision explicitly replaces part of it.

The plan is intentionally designed around TGReposter as a **Telegram Content Operations Platform**, not as a low-cost reposting bot.

TGReposter's commercial value is the complete workflow:

```text
Monitor
  ↓
Discover
  ↓
Filter
  ↓
Curate
  ↓
AI Transform
  ↓
Human Review
  ↓
Publish
  ↓
Promote
  ↓
Analyze
```

The platform should be sold on the operational value of running Telegram content workflows at scale rather than on individual technical actions such as forwarding one post.

---

## 2. Commercial Positioning

### 2.1 Product category

Approved positioning:

> **TGReposter is an AI-powered Telegram Content Operations Platform for channel owners, media teams, agencies, and channel networks. It monitors relevant Telegram sources, finds useful content, transforms it with AI, supports human review, and distributes or promotes approved content across Telegram destinations.**

TGReposter should not be positioned primarily as:

- an auto-forwarding bot;
- an AI rewriting bot;
- a Telegram scheduler;
- a single-channel publishing utility.

Those functions may exist inside the product, but they are components of the larger content-operations workflow.

### 2.2 Core value proposition

The commercial value should be communicated in terms of:

- reducing repetitive editorial work;
- increasing the number of sources that one person or team can monitor;
- allowing one operation to manage multiple Telegram channels;
- transforming content quickly with AI while keeping human control;
- supporting content distribution and promotion from the same workspace;
- helping teams scale Telegram operations without scaling manual work at the same rate.

---

## 3. Target Customer Hierarchy

The following customer hierarchy is approved.

| Tier | Target Customer | Primary Need | Commercial Role |
|---|---|---|---|
| **Free** | New / solo creator | Experience the workflow | Acquisition |
| **Creator** | 1–3 serious channels | Save publishing time | Entry paid |
| **Professional** | Multi-channel operator | Run daily content operations | Core plan |
| **Business** | Channel network / media team | Scale workflow and collaboration | Team plan |
| **Agency** | Teams managing many channels or clients | Operate multiple Telegram networks | High-value plan |
| **Enterprise** | Media holding / large organization | Infrastructure, governance, integrations, support | Contract sales |

### 3.1 Primary initial ICP

The first Ideal Customer Profile is:

> A Telegram operator or small media team managing approximately 3–30 channels, monitoring many external Telegram sources, publishing content every day, and spending meaningful human time discovering, cleaning, rewriting, translating, approving, and distributing posts.

A particularly strong pattern is:

```text
Many source channels
       ↓
TGReposter
       ↓
A smaller network of owned destinations
```

Example:

```text
50 source channels
       ↓
TGReposter
       ↓
5 owned channels
```

This is a stronger commercial target than a simple one-source-to-one-destination forwarding use case.

### 3.2 Priority customer segments

1. **Multi-channel owners and channel networks**
2. **Telegram media/news teams**
3. **Agencies and community-management teams**
4. **Promotion/distribution networks**
5. **Solo creators**
6. **Enterprise media organizations — later stage**

Solo creators are valuable for acquisition and word of mouth, but should not define the economics of the product.

Enterprise customers should be pursued after the platform has mature audit, security, support, integration, and governance capabilities.

---

## 4. Approved Subscription Hierarchy

The approved pricing hypothesis is:

| Plan | Monthly Price | Annual Price | Positioning |
|---|---:|---:|---|
| **Free** | €0 | €0 | Product acquisition |
| **Creator** | **€15/month** | **€150/year** | Serious solo operator |
| **Professional** | **€39/month** | **€390/year** | Multi-channel operator |
| **Business** | **€89/month** | **€890/year** | Team / media network |
| **Agency** | **€199/month** | **€1,990/year** | Agency / multi-client operation |
| **Enterprise** | Custom | Custom | Contract-based |

### 4.1 Annual billing rule

Annual billing provides approximately **two months free** relative to monthly billing.

Marketing presentation:

> **Save up to 17% with annual billing.**

Equivalent monthly display values may be used for annual plans:

| Plan | Equivalent Monthly on Annual Billing |
|---|---:|
| Creator | €12.50 |
| Professional | €32.50 |
| Business | €74.17 |
| Agency | €165.83 |

Annual prices are billed as one annual payment.

### 4.2 Most Popular plan

**Professional** should be presented as the default / "Most Popular" plan.

This is intended to become the center of the product's price-value curve.

---

## 5. Plan Architecture

The following entitlements are the current product-planning baseline.

Some capabilities listed below are roadmap items and must not be presented as available in production until implemented.

| Capability | Free | Creator | Professional | Business | Agency | Enterprise |
|---|---:|---:|---:|---:|---:|---:|
| Users | 1 | 1 | 3 | 10 | 30 | Custom |
| Source channels monitored | 3 | 15 | 75 | 250 | 1,000 | Custom |
| Destination channels/groups | 1 | 3 | 15 | 50 | 200 | Custom |
| Content Inbox | Yes | Yes | Yes | Yes | Yes | Yes |
| Keyword / hashtag filtering | Basic | Full | Full | Full | Full | Full |
| AI access | Included | Included | Included | Included | Included | Custom |
| AI model choice | OpenRouter catalog | OpenRouter catalog | OpenRouter catalog | OpenRouter catalog | OpenRouter catalog | Custom |
| Multi-destination publishing | No | Yes | Yes | Yes | Yes | Yes |
| Active Promotion Campaigns | 0 | 1 | 10 | 50 | 200 | Custom |
| Publishing history | 7 days | 90 days | 1 year | 2 years | 3 years | Custom |
| Scheduled publishing* | No | Basic | Yes | Yes | Yes | Yes |
| Automation rules* | No | No | Yes | Yes | Yes | Yes |
| Analytics* | Basic | Basic | Advanced | Advanced | Advanced | Custom |
| Team roles | No | No | Basic | Full | Full | Custom |
| Approval workflows* | No | No | No | Yes | Yes | Yes |
| Client workspaces* | No | No | No | No | Yes | Yes |
| API / Webhooks* | No | No | No | No | Limited | Yes |
| Support | Community | Standard | Standard | Priority | Priority | Dedicated |

`*` Roadmap capability: entitlement is approved conceptually, but the feature must not be sold as available before implementation.

---

## 6. Primary Commercial Meters

TGReposter should meter customer scale using understandable product concepts.

### 6.1 Source channels

**Primary scale meter.**

Source count closely represents:

- amount of monitoring work;
- scraping workload;
- incoming information volume;
- customer operational scale;
- value created by the platform.

It should be one of the strongest natural reasons to upgrade.

### 6.2 Destination channels/groups

Destination count represents the customer's publishing network.

This is a natural secondary scale meter and should remain visible in plan comparisons.

### 6.3 Team members

Team seats should drive progression from an individual product toward Business/Agency operation.

A user should not have to buy Business merely because they process a high content volume, but collaboration, permissions, approvals, and operational governance should belong to higher tiers.

### 6.4 Active campaigns

Promotion Campaigns are a separate value engine in TGReposter.

The commercial meter should be **active campaigns**, not every individual Telegram message sent.

Approved baseline:

- Free: 0
- Creator: 1
- Professional: 10
- Business: 50
- Agency: 200
- Enterprise: custom

### 6.5 AI balance

AI should be metered separately because its cost varies by model and token consumption.

The user-facing pricing page should not use raw infrastructure concepts such as:

- database rows;
- HTTP requests;
- bandwidth megabytes;
- token counts;
- compute seconds.

These can exist as internal fair-use and cost controls.

---

## 7. AI Strategy — OpenRouter Only at Launch

### 7.1 Approved AI gateway

**TGReposter will launch commercially using OpenRouter as the single AI gateway.**

The product should not require separate direct integrations with Gemini, OpenAI, Anthropic, DeepSeek, xAI, or other providers for the initial commercial release.

The benefit is:

```text
TGReposter
    ↓
OpenRouter
    ↓
Multiple model providers
    ↓
User model choice
```

This gives users broad model availability while allowing TGReposter to maintain one provider integration and one usage-accounting pipeline.

### 7.2 Model availability

Users should be able to select any compatible OpenRouter text model allowed by TGReposter policy and technical capabilities.

The commercial promise is:

> **Choose the AI you want.**

TGReposter should not be branded around one model family.

### 7.3 Default experience

Most customers should not have to understand model economics.

The default model option should be:

> **TGReposter Recommended**

Advanced users can switch to:

> **Choose model manually**

Future model selection may also become action-specific, for example:

- Rewrite → recommended writing model
- Translate → recommended multilingual model
- Summarize → low-cost summarization model
- Hashtags → low-cost classification/generation model

### 7.4 Dynamic OpenRouter model catalog

The long-term commercial implementation should not hardcode the complete model list in the frontend.

Recommended flow:

```text
OpenRouter Models API
        ↓
TGReposter model registry/cache
        ↓
Capability and price normalization
        ↓
Frontend model selector
```

The internal model registry should be able to store/cache at least:

- OpenRouter model ID;
- display name;
- provider;
- input pricing;
- output pricing;
- context length;
- relevant capabilities;
- active/disabled state;
- TGReposter recommendation category;
- approximate cost category.

Suggested customer-facing cost labels:

- Low cost
- Medium cost
- High cost
- Very high cost

Exact provider pricing can be exposed in an advanced details view.

---

## 8. AI Units and Included AI

### 8.1 Why AI must not be sold as fixed "transformations"

One AI action cannot always equal one credit because different OpenRouter models may have radically different costs.

For example, a short hashtag request on an inexpensive model may cost a small fraction of a premium long-form rewrite.

Therefore the approved model is:

> **AI Units represent underlying OpenRouter usage value rather than a fixed number of button clicks.**

### 8.2 Internal value baseline

Initial accounting baseline:

> **100 TG AI Units ≈ USD $1 of underlying model inference allowance.**

This is an internal commercial conversion rule and may later be adjusted without changing the plan names.

The implementation should use actual provider usage/cost data wherever available.

Conceptual flow:

```text
User requests AI operation
          ↓
TGReposter validates AI balance
          ↓
Request sent through OpenRouter
          ↓
OpenRouter model executes
          ↓
Usage/cost captured
          ↓
Cost converted to TG AI Units
          ↓
Units deducted from balance
```

### 8.3 Included monthly AI

Approved initial allowance:

| Plan | Included AI per Billing Cycle |
|---|---:|
| **Free** | 10 AI Units |
| **Creator** | 100 AI Units |
| **Professional** | 400 AI Units |
| **Business** | 1,000 AI Units |
| **Agency** | 2,500 AI Units |
| **Enterprise** | Custom |

These are launch hypotheses and should be monitored against real OpenRouter consumption after customers begin using the product.

### 8.4 Monthly allowance behavior

Included plan AI Units:

- refresh each billing cycle;
- are consumed before purchased top-up Units;
- do not need to roll over;
- are not cash-equivalent;
- should not block non-AI TGReposter features when exhausted.

When included AI is exhausted, the customer should still be able to:

- collect content;
- use filters;
- review the Content Inbox;
- manually edit;
- publish;
- use eligible campaign functionality.

AI operations should require one of:

1. additional purchased AI Units;
2. renewal of the monthly allowance;
3. upgrading to a higher subscription plan.

---

## 9. AI Top-Up Packs

AI top-ups are approved as an independent revenue stream.

Initial price hypothesis:

| Pack | AI Units | Price |
|---|---:|---:|
| **AI Mini** | 500 | **€7** |
| **AI Plus** | 2,000 | **€25** |
| **AI Pro** | 5,000 | **€55** |
| **AI Max** | 10,000 | **€99** |

### 9.1 Balance consumption order

```text
Included monthly AI balance
            ↓ first

Purchased AI top-up balance
            ↓ second
```

### 9.2 Purchased balance behavior

Purchased AI Units should:

- remain available after a subscription renewal;
- not be reset at the end of the monthly billing cycle;
- be accounted for separately from monthly included Units;
- remain tied to the account/workspace;
- be subject to final Terms of Service regarding expiration, refunds, and transferability.

### 9.3 No cost pass-through pricing

TGReposter should not sell provider usage at raw OpenRouter cost.

Top-up pricing must include margin for:

- OpenRouter/platform cost;
- payment processing;
- currency conversion risk;
- refunds/chargebacks;
- infrastructure;
- support;
- taxes/administration;
- TGReposter margin.

---

## 10. Free Plan Strategy

The Free plan is a permanent acquisition plan.

### 10.1 Approved Free plan

- €0 forever
- no credit card required
- 1 user
- 3 source channels
- 1 destination
- Content Inbox
- basic filters
- 10 AI Units/month
- OpenRouter AI access
- 7-day history
- manual editing
- manual publishing
- low-priority automatic monitoring
- manual synchronization
- no active Promotion Campaigns
- no team functionality

### 10.2 Purpose of Free

Free must be useful enough for a customer to complete the primary value loop:

```text
Telegram source
       ↓
Content Inbox
       ↓
Filter
       ↓
AI transform
       ↓
Review
       ↓
Publish
```

The Free plan must not be intentionally broken or reduced to a demo page.

Its purpose is to create product adoption, word of mouth, and natural expansion.

### 10.3 Free-account monitoring control

Continuous monitoring is a potentially important cost driver at scale.

Free accounts should therefore receive **low-priority monitoring**.

The implementation should support automatically pausing background source monitoring for inactive Free accounts.

Important rule:

> Configuration and customer data should remain stored; expensive background work can pause until the customer returns.

Manual synchronization can remain available subject to fair-use controls.

Paid tiers may receive progressively better monitoring priority.

Avoid publicly promising exact scan intervals until production benchmarks demonstrate they can be reliably maintained.

---

## 11. Trial Strategy

### 11.1 Launch decision

**No conventional time-limited paid-plan trial is required at launch.**

TGReposter will use:

> **Free forever**

as the primary product-led acquisition mechanism.

This avoids unnecessary complexity between:

- Free
- Trial
- Creator
- Professional
- Business
- Agency
- Enterprise

### 11.2 Future experiment

A future conversion experiment may temporarily unlock selected Professional features for new accounts for a short period without requiring a credit card.

This is **not** part of the launch billing specification.

---

## 12. Subscription Lifecycle Rules

### 12.1 Upgrade

Paid upgrades should:

- take effect immediately;
- apply new limits immediately;
- be prorated where supported by the billing provider;
- grant the new plan's entitlements immediately.

### 12.2 Downgrade

Downgrades should:

- be scheduled for the next renewal;
- keep the existing higher plan active until the end of the paid period;
- warn the customer if current usage exceeds the future plan limits;
- never delete customer data automatically.

At downgrade time, resources above the new plan limit should become inactive, paused, or read-only according to resource type.

### 12.3 Cancellation

Cancellation should:

- be allowed at any time;
- remain effective at the end of the current paid billing period;
- transition the account to Free unless another contract state applies.

Resources exceeding Free limits should be preserved but paused/inactive rather than deleted.

Example:

```text
23 configured sources
        ↓
Subscription ends
        ↓
3 remain active under Free
20 remain stored but paused
```

If the user later resubscribes, those resources can be reactivated.

### 12.4 Data preservation rule

> **TGReposter must never automatically delete customer configuration or content solely because the customer downgraded or canceled a paid subscription.**

Separate retention/deletion policies may still apply under Terms of Service, privacy requests, or long-term inactive-account policies.

---

## 13. Launch Pricing Strategy

Published list prices should remain:

- Creator: €15
- Professional: €39
- Business: €89
- Agency: €199

TGReposter should avoid launching with artificially low permanent prices that anchor the product below its intended category.

Preferred launch incentives:

- percentage discount for the first annual term;
- additional annual months;
- founding-customer benefits;
- referral/partner incentives.

Example launch message:

> **Founding Customer Offer — 30% off your first year**

or:

> **Subscribe annually during launch and receive an additional promotional benefit.**

Any launch offer should preserve the visible official list price.

---

## 14. Revenue Architecture

The initial revenue model contains four primary engines.

### 14.1 Subscription revenue

```text
Creator       €15/month
Professional  €39/month
Business      €89/month
Agency        €199/month
Enterprise    Custom
```

### 14.2 Annual prepayment

Benefits:

- improved cash flow;
- lower churn;
- stronger customer commitment;
- reduced payment frequency.

### 14.3 AI top-ups

Customers can increase AI usage without being forced to upgrade the entire subscription.

This is important when a customer has the correct operational tier but temporarily requires more AI.

### 14.4 Enterprise contracts

Enterprise should be negotiated and may include:

- custom limits;
- custom AI allowance;
- negotiated users;
- SSO;
- advanced audit logs;
- API/webhooks;
- SLA;
- dedicated support;
- custom retention;
- security review;
- custom integrations;
- potential private/dedicated deployment options.

### 14.5 Future optional revenue streams

These are not required for launch:

- additional team-seat packs;
- source-channel packs;
- destination packs;
- client/workspace packs;
- premium support;
- extended analytics;
- API usage;
- white-label options;
- partner/agency programs.

The launch pricing model should remain simple.

---

## 15. Agency Model

Agency should not simply be "Professional with larger limits."

Its long-term differentiation should be **client/workspace management**.

Target architecture:

```text
Agency Account
      │
      ├── Client / Workspace A
      │      ├ Sources
      │      ├ Content Inbox
      │      ├ Filters
      │      ├ Destinations
      │      ├ Campaigns
      │      ├ AI preferences
      │      ├ Team permissions
      │      └ Analytics
      │
      ├── Client / Workspace B
      │
      └── Client / Workspace C
```

Client/workspace data must remain isolated according to the platform's multi-tenant security model.

Workspace functionality is a roadmap requirement and must not be marketed as available before implementation.

---

## 16. Enterprise Model

Enterprise is a contractual product, not simply an Agency account with higher limits.

Potential Enterprise requirements include:

- negotiated source/destination limits;
- negotiated AI capacity;
- SSO;
- organization-level RBAC;
- audit logs;
- API access;
- webhooks;
- custom retention;
- custom integrations;
- dedicated support;
- SLA;
- security review;
- custom billing/invoicing;
- potential dedicated infrastructure.

Enterprise pricing remains **Custom / Contact Sales**.

---

## 17. Unit Economics Principles

### 17.1 Gross margin target

Initial product design should aim for approximately:

> **80% gross margin or better on normal customer usage.**

Direct cost of service should normally remain below approximately 20% of subscription revenue.

Reference COGS ceilings:

| Plan | Price | Approx. 20% COGS Ceiling |
|---|---:|---:|
| Creator | €15 | €3.00 |
| Professional | €39 | €7.80 |
| Business | €89 | €17.80 |
| Agency | €199 | €39.80 |

### 17.2 Primary cost risks

The important variable cost categories are:

1. OpenRouter model usage;
2. Telegram source monitoring/scraping;
3. backend compute;
4. database/storage;
5. outbound network/media traffic;
6. payment processing;
7. support load.

### 17.3 Important cost-control principles

- AI allowance must be based on actual underlying model usage.
- Free accounts should not generate unlimited continuous crawler workload indefinitely.
- Expensive models must consume proportionally more AI Units.
- Infrastructure-level fair-use controls may exist even when not exposed as pricing meters.
- Future heavy video/media functionality may require dedicated fair-use or transfer controls.
- Billing should be instrumented so cost per account/workspace can be measured.

---

## 18. Sales Messaging by Tier

### Free

Primary message:

> **Start your Telegram content workflow for free.**

Goal: activation.

### Creator

Primary message:

> **Save hours managing your Telegram channel.**

Goal: convert a serious solo operator.

### Professional

Primary message:

> **Run your multi-channel content operation from one workspace.**

Goal: core revenue and product-market fit.

This should be the **Most Popular** plan.

### Business

Primary message:

> **Scale your Telegram content team without scaling repetitive work.**

Goal: sell collaboration, operational controls, and scale.

### Agency

Primary message:

> **Operate multiple Telegram networks and client workflows from one platform.**

Goal: high-ARPU agency and network customers.

### Enterprise

Primary message:

> **Telegram content infrastructure for large organizations.**

Goal: negotiated deployment, governance, and support.

---

## 19. Go-to-Market Direction

The detailed acquisition program is a separate next-stage document, but current commercial direction is:

### 19.1 Primary channels to evaluate

- direct outreach to multi-channel Telegram operators;
- partnerships with Telegram channel owners;
- Telegram communities and operator groups;
- referral/affiliate program;
- content marketing and SEO;
- agency partnerships;
- product-led conversion from Free;
- founding-customer program.

### 19.2 Initial growth sequence

```text
First 10 paying customers
          ↓
Validate onboarding, willingness to pay, and limits
          ↓
First 100 paying customers
          ↓
Validate retention, plan distribution, AI cost, crawler cost
          ↓
First 1,000 paying customers
          ↓
Scale acquisition channels and introduce mature Agency/Enterprise motion
```

Before scaling paid acquisition, TGReposter should measure:

- activation rate;
- Free → paid conversion;
- plan distribution;
- churn;
- expansion/upgrade rate;
- average sources per customer;
- average destinations per customer;
- AI Units consumed;
- OpenRouter cost per customer;
- crawler cost per active source;
- support burden by plan;
- MRR;
- ARPU;
- gross margin.

---

## 20. Product and Engineering Requirements Derived from Pricing

The following platform work is required before or during commercial billing implementation.

### 20.1 Subscription domain model

Create a normalized subscription model supporting at least:

- account/user/workspace owner;
- plan ID;
- billing interval;
- subscription state;
- current period start/end;
- scheduled downgrade/cancellation;
- external billing customer ID;
- external subscription ID;
- trial state if later introduced;
- timestamps.

Recommended plan identifiers:

```text
free
creator
professional
business
agency
enterprise
```

### 20.2 Central entitlement registry

Do not scatter plan checks through UI components.

Create a centralized backend-controlled entitlement definition.

Conceptually:

```ts
type PlanId =
  | "free"
  | "creator"
  | "professional"
  | "business"
  | "agency"
  | "enterprise";

interface PlanEntitlements {
  maxUsers: number | null;
  maxSources: number | null;
  maxDestinations: number | null;
  maxActiveCampaigns: number | null;
  historyDays: number | null;
  monthlyAiUnits: number | null;
  monitoringPriority: string;
  features: string[];
}
```

The backend must be authoritative.

Frontend plan checks should be used for presentation only, not security or enforcement.

### 20.3 Usage counters

The platform needs reliable counters for:

- active sources;
- destinations;
- team members;
- active campaigns;
- monthly included AI Units;
- purchased AI Units;
- optional future high-volume controls.

Usage counters should be derived from authoritative data wherever practical rather than maintained as fragile duplicated state.

### 20.4 AI usage ledger

Create an append-only or auditable AI usage ledger containing at least:

- account/workspace;
- user;
- timestamp;
- operation;
- OpenRouter model ID;
- input tokens when available;
- output tokens when available;
- provider-reported cost;
- TG AI Units charged;
- balance source used (included/top-up);
- request status;
- reference to the post/content when appropriate.

This ledger is important for:

- billing accuracy;
- customer usage screens;
- cost analysis;
- disputes;
- anomaly detection.

### 20.5 AI balance ledger

Included and purchased AI balances should be represented separately.

The implementation should support:

- monthly allocation;
- monthly reset;
- purchased top-up credits;
- consumption order;
- refunds/adjustments;
- administrative corrections;
- audit history.

Avoid storing only one mutable integer if doing so would make reconciliation impossible.

### 20.6 OpenRouter model registry

Add a backend service/cache for the OpenRouter model catalog.

Responsibilities:

- fetch models;
- normalize pricing;
- filter incompatible models;
- cache results;
- mark recommended models;
- expose safe model metadata to the frontend;
- support model deprecation/removal without breaking saved settings.

### 20.7 Plan enforcement

Backend enforcement is required when customers:

- create/enable a source;
- create/enable a destination;
- invite/add a team member;
- create/activate a campaign;
- perform AI generation;
- access plan-gated functionality.

Do not rely solely on hidden/disabled frontend controls.

### 20.8 Monitoring scheduler

The source-monitoring system should become plan-aware.

It should support:

- monitoring priority;
- paused Free accounts;
- inactive-account detection;
- manual sync;
- fair-use and retry controls;
- queue observability.

### 20.9 Downgrade-safe resource states

Resources need a state model that can preserve but disable excess items after a downgrade.

Potential statuses:

```text
active
paused
plan_limited
disabled
archived
```

No destructive deletion should be required for plan enforcement.

### 20.10 Billing events/webhooks

When a payment provider is selected, billing integration must process events idempotently.

Typical events:

- checkout completed;
- subscription created;
- subscription renewed;
- payment failed;
- subscription upgraded;
- downgrade scheduled;
- subscription canceled;
- refund;
- top-up purchase completed.

Every external billing event should be deduplicated and auditable.

---

## 21. Required Customer-Facing Billing UI

Future billing/settings UI should include:

### Subscription

- current plan;
- monthly/annual billing interval;
- renewal date;
- change plan;
- cancel subscription;
- billing portal/invoices where supported.

### Usage

- sources used / allowed;
- destinations used / allowed;
- users used / allowed;
- active campaigns used / allowed;
- AI Units remaining;
- included AI vs purchased AI.

Example:

```text
AI Balance
────────────────────────────
Included this month    182 / 400
Purchased balance     1,250

Renews                 Nov 6, 2026
```

### Upgrade messaging

Upgrade prompts should explain the operational benefit, not merely display an error.

Example:

> You've reached the 75-source limit on Professional. Upgrade to Business to monitor up to 250 sources and unlock full team controls.

---

## 22. Pricing Page Principles

The public pricing page should:

- show annual/monthly toggle;
- default to annual once conversion data supports it;
- mark Professional as "Most Popular";
- explain AI Units clearly;
- state that model availability comes through OpenRouter;
- avoid raw token/compute terminology in the main comparison;
- distinguish roadmap features from live features;
- clearly show the Free plan requires no card;
- clearly show cancellation behavior;
- provide Contact Sales for Enterprise.

The pricing page must never advertise a feature that is not currently production-ready simply because it exists in this strategy document.

---

## 23. Commercial Decisions — Locked Baseline

The following decisions are approved as the current baseline:

- **Product category:** Telegram Content Operations Platform
- **Primary ICP:** multi-channel Telegram operators and small media teams
- **Free forever:** Yes
- **Credit card for Free:** No
- **Conventional trial at launch:** No
- **Creator:** €15/month
- **Professional:** €39/month
- **Business:** €89/month
- **Agency:** €199/month
- **Enterprise:** Custom
- **Annual billing:** Yes
- **Annual discount model:** approximately two months free
- **Most Popular plan:** Professional
- **AI gateway at launch:** OpenRouter only
- **AI model choice:** broad compatible OpenRouter catalog
- **Default AI option:** TGReposter Recommended
- **AI included in subscriptions:** Yes
- **AI usage accounting:** based on underlying model usage/cost
- **AI top-ups:** Yes
- **Purchased AI balance:** separate from monthly included balance
- **Monthly included AI:** resets each billing cycle
- **Purchased AI:** preserved across ordinary subscription renewals
- **Upgrade:** immediate and prorated when supported
- **Downgrade:** next renewal
- **Cancellation:** end of paid billing period
- **Delete data because of downgrade/cancellation:** Never automatically
- **Free background monitoring:** lower priority and pausable for inactivity
- **Agency differentiation:** client/workspace architecture
- **Enterprise:** contract product, not simply higher numerical limits

---

## 24. Decisions Still Requiring Future Validation

The following are intentionally not permanently locked and should be validated with real customer and cost data:

- exact AI Unit conversion ratio;
- final monthly included AI Unit allowances;
- final AI top-up quantities/prices;
- exact source monitoring frequency by tier;
- exact inactive-Free-account pause threshold;
- exact fair-use limits;
- exact payment provider;
- VAT/tax handling;
- refund policy;
- purchased AI expiration policy, if any;
- grandfathering policy for future price increases;
- launch discount percentage and duration;
- affiliate/referral commission structure;
- additional seat/source/workspace add-on pricing;
- Enterprise minimum contract value;
- workspace/client limits for Agency;
- SLA terms.

---

## 25. Recommended Development Sequence

### Phase 1 — Commercial data model

1. Plan identifiers and entitlement registry
2. Subscription tables/domain model
3. AI usage ledger
4. AI balance ledger
5. usage-counter services

### Phase 2 — OpenRouter commercial AI

1. OpenRouter-only production abstraction
2. model registry/cache
3. TGReposter Recommended model logic
4. usage/cost capture
5. AI Unit calculation
6. included balance enforcement
7. top-up balance support

### Phase 3 — Plan enforcement

1. source limits
2. destination limits
3. campaign limits
4. team-member limits
5. history/retention presentation
6. feature gates
7. downgrade-safe paused resources

### Phase 4 — Billing

1. select payment provider
2. monthly plans
3. annual plans
4. checkout
5. webhook handling
6. upgrades/proration
7. scheduled downgrades
8. cancellation
9. AI top-up checkout
10. invoices/billing portal

### Phase 5 — Customer billing UI

1. Pricing page
2. Subscription settings
3. Usage dashboard
4. AI balance UI
5. upgrade prompts
6. downgrade warnings
7. billing history

### Phase 6 — Commercial launch

1. final legal/Terms review
2. verify production plan limits
3. validate OpenRouter cost tracking
4. validate payment webhooks
5. founding-customer offer
6. onboard first 10 paying customers
7. measure activation, conversion, churn, COGS, and support
8. revise allowances based on real usage

---

## 26. Success Criteria for Pricing v1

Pricing v1 should be considered healthy when:

- customers understand the difference between plans without sales assistance;
- Professional becomes a strong default choice for multi-channel users;
- Free users can reach the core activation moment;
- Free inactive accounts do not create uncontrolled crawler cost;
- OpenRouter cost can be attributed to individual customer accounts/workspaces;
- normal paid accounts maintain healthy gross margins;
- AI-heavy users can buy top-ups rather than being forced into the wrong subscription tier;
- upgrades happen naturally as operations grow;
- downgrades/cancellations do not cause destructive data loss;
- Agency customers can eventually isolate multiple client operations;
- pricing can evolve without rewriting core authorization/business logic.

---

## 27. Final Commercial Framework

```text
FREE
€0
Acquisition
Low-priority monitoring
10 AI Units

        ↓

CREATOR
€15/month
Serious solo operator
15 sources / 3 destinations
Included AI

        ↓

PROFESSIONAL
€39/month
MOST POPULAR
Multi-channel content operation
75 sources / 15 destinations
3 users
Included AI

        ↓

BUSINESS
€89/month
Teams + approvals + scale
250 sources / 50 destinations
10 users
Included AI

        ↓

AGENCY
€199/month
Client/workspace operations
1,000 sources / 200 destinations
30 users
Included AI

        ↓

ENTERPRISE
Custom
Governance + integrations + SLA
Custom limits and commercial terms
```

TGReposter's long-term advantage should not be "cheaper forwarding."

It should be:

> **One platform for discovering, curating, transforming, reviewing, publishing, and promoting Telegram content at operational scale.**
