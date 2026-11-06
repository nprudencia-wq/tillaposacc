<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Sales and stock changes go through the `complete_sale` / `adjust_stock` database functions only; tables have no direct write grants for sales or stock movements, so prices and the stock audit trail can't be bypassed by cashiers.
- Roles live in `user_roles`; `handle_new_user` only accepts trusted administrative staff creation. Public staff signup is rejected to prevent outsiders entering the existing shop.
- Money is stored in USD; ZiG amounts are converted with `settings.zig_rate` at sale time and the rate is saved on each sale.
- Offline sales queue and catalog cache live in IndexedDB via src/lib/local-db.ts (src/lib/offline.ts keeps an in-memory mirror; older localStorage queues migrate on load) and upload via `complete_offline_sale`, which dedupes on `client_ref`; non-cash offline payments start unverified. Why: retries must never double-sell.
- The service worker registers only from src/lib/pwa.ts and never in dev/preview. Why: stale caches break the editor preview.
- Staff log in by username mapped to `<username>@staff.tilla.local` (src/lib/username.ts); accounts with real emails still log in by email. Why: auth requires an email; auto-confirm is on because placeholder addresses can't receive mail.
- Access rights = role default overridden per person in `user_permissions`, resolved by `has_permission()`; `can_refund`/`can_manage_stock`/`can_post_expense` wrap it and disabled profiles fail `is_staff`. Keep src/lib/username.ts ROLE_DEFAULTS in sync with `role_allows()`.
- Payment methods are data, not code: `payment_types` (code, name, is_cash, active) holds the shop's own list, a trigger rejects sale/refund methods that aren't in it, and drawer cash is whatever row has `is_cash` (`is_cash_method()`). Why: adding EcoCash or InnBucks must need no code change, and shift maths stay right.
- Customer debt: a payment type with `is_account` puts sale value on the sale's customer; balance = account sale payments − `customer_payments` − account refunds (`customer_balance()`), credit limit enforced in `complete_sale`. Cash repayments also log a shift `paid_in` so cash-ups stay right. Why: no separate debt ledger to drift out of sync.
- Till PIN login: PIN hashes live in `staff_pins` (no client grants); the public `pinLogin` server fn checks via service-only `check_staff_pin` (5 wrong → 5-min lock) then signs in with a one-time magic-link token. Why: PINs must never be readable or brute-forced from the browser.
- Activity log is written by database triggers (`log_activity`) plus `log_event` for sign-in/out; clock-in/out only via `clock_in`/`clock_out`. Why: staff can't skip or edit their own trail.
- Accounting ledger lines are derived on read by `gl_lines()` from sales, refunds, GRNs, payments, expenses, stock movements and manual `journal_entries`; only manual journals are stored. Why: the books can never drift from the till records.
- Inventory form saves use `save_inventory_product` atomically; absolute quantity corrections check the previously read balance and delegate movement writes to `adjust_stock`. Why: stale forms cannot overwrite intervening sales or lose opening-stock audit entries.
- Supplier invoice currencies are separate from till currencies; `receive_goods_currency` captures invoice units per USD and original costs while passing USD costs into `receive_goods`. Why: supplier balances and derived accounting continue to use USD without changing checkout.
- Supplier deletion uses `delete_supplier`, which rejects suppliers with transaction history. Why: correcting unused entries must never erase purchases, payments or returns.
- Phase 1 uses `stores` and protected `store_memberships` as its additive ownership foundation; do not provision other stores until all business tables, security-definer functions, storage and browser queues are isolated and negative cross-store tests pass. Why: the legacy POS still has singleton assumptions.
- Privileged staff password resets must verify the caller and target share a store before loading the admin client. Why: global management roles must not authorize cross-store account changes.
- Staff creation derives trusted store metadata from the authenticated membership before loading the admin client; non-vendor usernames are store-prefixed to preserve unique sign-in identities. Why: staff must not default into the vendor shop.
- All legacy business rows carry a backfilled store_id with restrictive authenticated policies and immutable ownership guards; these are not a substitute for auditing privileged reads and related IDs. Why: security-definer routines bypass row policies.
- Device persistence keys include both store and staff identity; unidentified legacy queues remain quarantined rather than reassigned. Why: changing login must never upload another cashier's sales.

- Sales documents are store-scoped snapshots linked to protected sales/refunds, never a second stock, debt or accounting ledger; posting locks the document to prevent duplicate transactions.
- Tender exchange rates are stored per payment; Rand units per USD remain unconfigured until entered, and historical USD accounting never uses today's rates.
- Rand checkout requires a store-scoped confirmation matching the current rate; rate changes invalidate confirmation and database sale/payment triggers enforce it. Why: ambiguous conversions must not enable trading.
- GRN drafts are store-scoped, version-checked snapshots; locked posting delegates to receive_goods_currency and retains the linked receipt for deduplication. Why: temporary saves cannot change stock or double-receive.
- Offline shifts are created on the device (src/lib/offline.ts LocalShift) with a client UUID and uploaded via idempotent `open_offline_shift` before any queued sale. Why: offline sales must always have a real shift to attach to.
- Offline till PIN unlock keeps only a PBKDF2 hash plus that cashier's own saved sign-in on the device (src/lib/offline-pin.ts), only after an online PIN sign-in there, with a local 5-try lock. Why: the server PIN store stays unreadable; offline unlock can't admit someone who never signed in on that till.

- Till hardware config is device-local (src/lib/hardware.ts, ESC/POS in escpos.ts); network printers need an HTTP print address. Why: browsers lack raw TCP.
