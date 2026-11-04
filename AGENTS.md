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
- Roles live in `user_roles`; first signup becomes owner, later signups become cashier (trigger `handle_new_user`).
- Money is stored in USD; ZiG amounts are converted with `settings.zig_rate` at sale time and the rate is saved on each sale.
- Offline sales queue in localStorage (src/lib/offline.ts) and upload via `complete_offline_sale`, which dedupes on `client_ref`; non-cash offline payments start unverified. Why: retries must never double-sell.
- The service worker registers only from src/lib/pwa.ts and never in dev/preview. Why: stale caches break the editor preview.
- Staff log in by username mapped to `<username>@staff.tilla.local` (src/lib/username.ts); accounts with real emails still log in by email. Why: auth requires an email; auto-confirm is on because placeholder addresses can't receive mail.
- Access rights = role default overridden per person in `user_permissions`, resolved by `has_permission()`; `can_refund`/`can_manage_stock`/`can_post_expense` wrap it and disabled profiles fail `is_staff`. Keep src/lib/username.ts ROLE_DEFAULTS in sync with `role_allows()`.
- Payment methods are data, not code: `payment_types` (code, name, is_cash, active) holds the shop's own list, a trigger rejects sale/refund methods that aren't in it, and drawer cash is whatever row has `is_cash` (`is_cash_method()`). Why: adding EcoCash or InnBucks must need no code change, and shift maths stay right.
- Customer debt: a payment type with `is_account` puts sale value on the sale's customer; balance = account sale payments − `customer_payments` − account refunds (`customer_balance()`), credit limit enforced in `complete_sale`. Cash repayments also log a shift `paid_in` so cash-ups stay right. Why: no separate debt ledger to drift out of sync.
- Till PIN login: PIN hashes live in `staff_pins` (no client grants); the public `pinLogin` server fn checks via service-only `check_staff_pin` (5 wrong → 5-min lock) then signs in with a one-time magic-link token. Why: PINs must never be readable or brute-forced from the browser.
- Activity log is written by database triggers (`log_activity`) plus `log_event` for sign-in/out; clock-in/out only via `clock_in`/`clock_out`. Why: staff can't skip or edit their own trail.
