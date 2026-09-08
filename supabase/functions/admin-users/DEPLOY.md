# Deploying the `admin-users` Edge Function

This function performs the privileged user-management actions (create, invite,
delete, ban, change role) that **cannot** run in the browser because they need
the Supabase **service-role** key.

You run these steps once (and re-run `deploy` whenever the function changes).

## Prerequisites

- The Supabase CLI: https://supabase.com/docs/guides/cli
- You're logged in and linked to your project:
  ```bash
  supabase login
  supabase link --project-ref <your-project-ref>
  ```
  (`<your-project-ref>` is the subdomain of your project URL, e.g.
  `txgxonwcdrxayurzjcwb`.)

## 1. Run the SQL migration first

In the Supabase dashboard → SQL Editor, run:

```
supabase/migrations/0003_user_roles.sql
```

This adds the `role` enum, `banned_at`, keeps `is_admin` in sync, and creates
the admin-only `admin_users` view. The function and the UI both depend on it.

## 2. Service-role key — nothing to set

The function reads `SUPABASE_SERVICE_ROLE_KEY`, which Supabase **injects into
every Edge Function automatically**. You do NOT need to set any secret.

> Do not try `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` — Supabase
> reserves the `SUPABASE_` prefix and will reject it. It's already available.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected the same way.

## 3. Deploy

Deploy with `--no-verify-jwt` so the browser's CORS preflight reaches the
function (which does its own admin check internally):

```bash
supabase functions deploy admin-users --no-verify-jwt
```

## 4. Verify

The function is called by the Users page in the app. To smoke-test manually
(replace the token with an **admin** user's access token):

```bash
curl -i -X POST \
  "https://<project-ref>.functions.supabase.co/admin-users" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type":"setRole","user_id":"<some-user-id>","role":"staff"}'
```

A non-admin token must return `403 Admin privileges required`.

## Notes

- The function authenticates the caller with the anon client (RLS applies) and
  refuses anyone whose profile role isn't `admin`, **then** switches to the
  service-role client to act. A leaked anon key still can't use it.
- Self-protection is built in: you can't delete, ban, or de-admin your own
  account through it.
- `invite` sends Supabase's invite email; `create` with a password makes a
  ready-to-use account. Configure the email templates/SMTP in the dashboard for
  invites to actually send.
