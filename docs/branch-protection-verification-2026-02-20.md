# Branch Protection Verification (2026-02-20)

Repository: `josephlevy1/targum_teamim`  
Branch: `main`

## Verified Settings
- Branch protection enabled on `main`.
- Required approving reviews: `2`.
- Required status checks:
  - `quality-checks`
  - `validate-pr-body`
- Require branches to be up to date before merging: enabled (`strict: true`).
- Enforce admins: enabled.

## Verification Method
- Applied and verified via GitHub API (`gh api`) on 2026-02-20.
- Endpoint used:
  - `PUT /repos/josephlevy1/targum_teamim/branches/main/protection`
  - `GET /repos/josephlevy1/targum_teamim/branches/main/protection`
