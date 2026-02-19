# Next Steps: Issue #2 (Clerk Auth)

## 1) Configure Clerk app
- Create a Clerk application (dev + prod).
- In Clerk dashboard, enable username sign-in.
- Add allowed origins/domains including `taam.im`.

## 2) Set environment variables
Update `/Users/josephlevy/Dev/targum_teamim/apps/web/.env`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_xxx
CLERK_SECRET_KEY=sk_live_or_test_xxx
```

## 3) Restart app with new env
```bash
cd /Users/josephlevy/Dev/targum_teamim
pm2 restart targum-web --update-env
```

## 4) Verify runtime health
```bash
pnpm deploy:taam:check
```
Expected: all checks pass.

## 5) Validate auth behavior

### Signed-out behavior
- Open `https://taam.im`
- Confirm content loads (read access works).
- Try an edit action (patch/undo/redo/verify/flag/transpose).
- Expected: blocked with login-required error (401 path).

### Signed-in behavior
- Sign up / log in from UI controls (top-right).
- Repeat edit actions.
- Expected: writes succeed.

## 6) Confirm changelog attribution
- Make a patch edit while signed in.
- In Patch History, confirm entry shows `by <username>`.

## 7) Close GitHub issue #2
After checks pass, close issue with a short note that includes:
- read access remains public,
- write routes now require login,
- patch history now records username.

## Optional hardening follow-up
- Add role-based editor allowlist (if you want only specific users to edit).
- Add a short smoke-test script for signed-out 401 and signed-in 200 mutation checks.
