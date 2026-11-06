# Tilla POS: Seven-phase build

## Non-negotiable safeguards
- Keep your existing store, staff, stock, sales and accounts intact.
- Your own store stays permanently free for every till, with no subscription lock.
- Client shops pay $10 per till per month. Their data must never mix with yours or another client's.
- New trials last exactly 14 days, with no extra trial grace period.
- Build and verify each phase before enabling it for live customers. These seven phases are not yet complete.

## Phase 1 — Separate stores and automatic trials
**Already started:** original store and staff registered; free-till protection; public staff registration blocked.

Complete store separation across products, sales, customers, suppliers, accounting, settings, staff, photos and offline sales. New business owners receive their own shop, not staff access to yours. Seed Bread, Milk and Cooking Oil only inside the new trial shop, clearly marked as sample items.

Add a trial signup page, 14-day countdown and the checklist: set exchange rate → make first sale → view report. Add a vendor-only trial register, expiry sorting, WhatsApp/call actions, and a recorded extension action. Trial owners cannot give themselves free subscriptions or extend trials.

**Release gate:** test two isolated shops, including deliberately attempted cross-shop reads, sales, refunds, staff resets, photo access and offline uploads. Verify your store remains free with multiple tills.

## Phase 2 — Till, Rand and fast checkout
- USD, ZiG and Rand across rates, sales, split payments, receipts, expenses, customer repayments, refunds, reports and drawer cash-up. Keep USD as the accounting currency and save transaction-time rates.
- Block zero or insufficient stock at checkout and in protected sale operations; show clear availability in both till views. Offline uploads retain their original records and report conflicts rather than silently disappearing.
- List/tile switcher with List as the device default; preserve the sale window.
- Option B completion screen: change due, prominent focused Print Receipt, New Sale, Share and a saved auto-print preference.
- Structured thermal receipts with store details, item lines and payment breakdown. Show fiscal details only when genuinely returned by the fiscal service.

## Phase 3 — Inventory and supplier upgrades
Finish verifying the existing editable stock quantities, reason-required corrections and Save actions. Verify supplier editing and history-protected deletion; USD/ZiG/Rand goods received with editable invoice rates and automatic empty entry lines. Check stocktake quantity/value variances, stock movements and accounting results with real saved records.

## Phase 4 — Quotations, invoices and credit notes
- Numbered quotations with customer details, expiry, print/PDF and conversion to a sale; quotes do not deduct stock or create debt.
- Numbered invoices, payment terms, outstanding balances, repayments and protected credit-limit enforcement. Conversion/payment retries cannot create duplicate sales or debt.
- Numbered partial/full credit notes tied to original receipts. Record returned versus damaged goods and settlement separately; prevent returning more than sold. Support cash/payment refunds, account credits and tracked store credit, with matching accounting entries.

## Phase 5 — VAT and ZIMRA fiscalisation
Add configurable VAT rate, tax on/off, inclusive/exclusive prices and product tax treatment. Preserve tax amounts on historical sales, invoices and credit notes; do not change old totals when settings change.

Prepare genuine fiscal submission, response records, retry handling and verification details. **Live ZIMRA fiscalisation requires official integration documentation, registered device/business details, credentials or certificates, and required testing/approval.** Until those are supplied and verified, receipts must not claim fiscalisation or certification. Do not assume a statutory VAT rate.

## Phase 6 — Discounts, loyalty and debtor controls
Add permission-controlled preset/custom percentage and fixed discounts with audit records. Add configurable loyalty earning/redemption and a points ledger with duplicate/refund protection.

Add configurable overdue interest and bad-debt provisions/write-offs with accounting integration. Financial rates, aging rules, compounding and loyalty ratios remain configurable and **off until you choose and activate them**; do not impose invented charges on customers. Scheduled interest must be idempotent and store-scoped.

## Phase 7 — Camera capture and photo upload
Add Take Photo and Choose File on inventory. Use the rear camera on supported mobile devices and a live webcam view on supported desktops; provide snap, retake and use-photo actions. Compress images before secure store-specific upload, handle denied camera access and keep the existing product unchanged if an upload fails.

## Technical implementation
- Use additive Lovable Cloud migrations with explicit grants, store-scoped policies, same-store relationships and guarded database functions. Preserve existing IDs and trading history; no destructive reset.
- Audit every security-definer function and privileged endpoint separately from row policies. Existing broad policies and singleton settings cannot coexist with unrestricted customer provisioning.
- Bind offline queues and cached/held carts to the originating store and user; preserve pending legacy sales rather than deleting or reassigning them.
- Use TanStack server functions for internal operations; authenticated server calls verify identity and store membership. External callbacks verify signatures before writes.
- Keep payment methods shop-managed. Document new architecture rules and maintain the phase checklist.
- Each content page gets its own title and sharing metadata. Verify desktop/mobile layouts and signed-in central workflows; keep concrete financial/stock/permission tests in the project.

## External dependencies and rollout
- Keep manual subscription references/approval working. Automatic collection requires an eligible payment provider and your approval before enabling it; never treat a submitted reference as confirmed money.
- ZIMRA production connection waits for official access and approval, not fabricated credentials or fiscal numbers.
- Changes to the shared live database happen cautiously; publish customer-facing code only after the relevant phase passes its release checks.

## Completion criteria
Each phase is complete only when its saved results read back correctly, isolation/financial tests pass and its live workflow has been exercised. Report unfinished work and external dependencies explicitly rather than marking all seven phases complete at once.