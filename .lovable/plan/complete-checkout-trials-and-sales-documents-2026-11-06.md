# Complete checkout, trials and sales documents

## Scope and safeguards
Complete Rand checkout, automatic trial onboarding, quotations, invoices and credit notes. Preserve existing shop records and keep all your tills permanently free. Loyalty remains disabled; debtor interest and ZIMRA integration are outside this request.

## 1. Finish store separation before trial signup
- Complete isolation of store settings, staff usernames/PINs, subscription records, accounting accounts, product photos and protected business operations.
- Keep pending offline sales attached to their original shop and cashier. Never reassign unidentified legacy queues.
- Test two shops against attempted cross-shop reads, changes, refunds, staff resets, photo access and queued sales. Keep public trial signup closed until these tests pass.

## 2. Complete USD, ZiG and Rand checkout
- Add an editable Rand-per-USD rate and all three currencies to checkout, split payments, change, receipts, refunds, customer repayments, expenses and cash-up.
- Save the relevant rates with each transaction; preserve USD accounting and existing historical totals.
- Carry Rand through offline sales and reports. Verify cash drawer amounts independently for each currency and enforce stock availability.

## 3. Open automatic trials safely
- Add a public business-owner signup flow that creates a separate shop, owner access, settings and sample Bread, Milk and Cooking Oil.
- Give each new shop exactly 14 days before till lock, with no additional trial grace. Preserve the vendor shop's unlimited free tills and $10-per-till monthly client pricing.
- Add the three-step checklist: set exchange rate, ring up first sale, view report.
- Add the vendor-only trial list sorted by expiry, contact actions and audited extensions. Retain manual subscription payment verification; submitted references are not confirmed payments.

## 4. Quotations and invoices
- Add a Documents page with searchable lists, customer details, editable lines, Save, expiry/due dates, status and printable/PDF documents.
- Number quotations and invoices separately. Quotations do not move stock or create debt.
- Convert quotes to invoices or checkout without re-entering lines. Keep unpaid drafts separate from posted customer debt.
- Posting an invoice creates one linked protected sale; account invoices enforce the customer's credit limit. Display payments and outstanding balance from the existing customer records, not a second debt ledger.
- Prevent repeated clicks or retries from creating duplicate invoices, sales or debt. Record cancellation and conversion history.

## 5. Credit notes
- Create numbered full or partial credit notes from original posted sales/invoices, with returned quantities, reason, condition and settlement.
- Restock sellable returns; record damaged returns through audited stock operations.
- Support payment refunds, customer-account credits and separately tracked store credit. Require existing refund permissions and an open shift for cash settlement.
- Prevent returns above the remaining sold quantity and duplicate settlement. Keep customer statements, stock and accounting consistent.
- Print/PDF credit notes with original document reference. Do not label them ZIMRA-fiscalised.

## Technical implementation
- Use additive database changes, explicit grants and store-scoped access; audit privileged functions independently of row policies.
- Use the existing protected sale, refund and stock operations as the transaction authority, extending them where required rather than bypassing them.
- Use store-specific document numbering and idempotency keys. Validate customer, product, sale, shift and payment identifiers against the caller's shop.
- Add unique page metadata, navigation and mobile-friendly editing/printing views using the current design system.

## Verification and release
Run concrete currency, stock, credit-limit, numbering, duplicate-retry and cross-shop tests. Exercise signup, quote conversion, account invoice payment and partial credit notes while signed in; confirm saved results read back through the app. Verify your shop remains free and unchanged. Report each release separately and do not claim completion for unverified flows.