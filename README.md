<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/18993dd1-5d20-4dc0-b45a-7f0d8a9354d7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Development policy

TGReposter is multilingual by default. Every user-facing change must be completed in **English, Russian, Arabic, and Persian** in the same change, including RTL support where applicable.

See [AGENTS.md](./AGENTS.md) for the mandatory repository rules and multilingual definition of done.

## Commercial Sales Plan — implementation and changelog

The commercial billing/Sales Plan work is documented separately from the production application. Feature-branch code and staging migrations **must not be mistaken for launched customer subscriptions**.

- [Approved Pricing & Sales Plan](./docs/PRICING_AND_SALES_PLAN.md) — product strategy, tier limits, AI Units, pricing and go-to-market hypotheses.
- [Sales Plan Implementation Record](./docs/SALES_PLAN_IMPLEMENTATION_RECORD.md) — comprehensive architecture, database model, APIs, delivery status, testing and launch blockers.
- [Sales Plan Implementation Changelog](./docs/SALES_PLAN_IMPLEMENTATION_CHANGELOG.md) — chronological technical changes across Phases 1–11, PRs #35–#45, and staging migration/deployment reconciliation.

**Status as of October 13, 2026:** commercial schemas are on staging with plans and top-up packs unpublished; customer checkout, funded OpenRouter charging and production deployment are not activated. Refer to the documents for exact scope and verification limitations.
