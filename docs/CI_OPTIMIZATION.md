# CI optimization invariant

The Echo Arena pipeline is optimized only at the orchestration layer.

- Merge request pipelines remain authoritative for review branches.
- A push pipeline is suppressed only when the same branch already has an open merge request.
- Branches without an open merge request still run quality + security preview.
- `main` still runs quality gates before production deploy.
- No quality/security test or deploy validation is removed.
- Jobs remain `interruptible`, so superseded commits can be canceled without weakening the latest commit validation.
- Opening an MR changes only which pipeline is authoritative; it does not change which gates the reviewed commit must pass.

This change reduces duplicate compute; it does not reduce validation coverage.
