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
