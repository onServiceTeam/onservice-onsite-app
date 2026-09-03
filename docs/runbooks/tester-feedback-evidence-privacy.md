# Tester feedback evidence privacy runbook

## Purpose

Protect screenshots submitted through the public tester-feedback form without
destroying historical evidence or breaking the Admin triage workflow. This
runbook implements E52 Option A, approved by Ken on 2026-09-01.

## Access and handling policy

- Screenshot evidence is private tester evidence. It may contain customer,
  provider, admin, booking, address, message, or payment context.
- An authenticated `admin` or `super_admin` may review evidence only from the
  selected Tester Feedback record. The API verifies that the record references
  the requested filename.
- A custodian of `FEEDBACK_EXPORT_KEY` may run the private feedback pull. The key
  belongs in the `x-feedback-key` request header, never in a URL, Markdown file,
  screenshot link, issue, chat, shell-history literal, or Git commit.
- Raw `/uploads/feedback/...` values are storage identifiers. They are not
  shareable links.
- The generated inbox, JSON, and downloaded images are tester data and PII.
  They remain gitignored, should be kept only on an authorized workstation, and
  must not be copied into tickets or public design tools without a separate
  redaction and authorization decision.
- Do not delete, rename, move, or bulk-redact existing evidence. E21 still
  requires a DPO/attorney-approved retention matrix. This runbook does not set a
  retention period.

## Periodic access review

At launch and after any privileged staffing or suspected-secret event:

1. Review the active `admin` and `super_admin` account roster. Remove access
   through the governed account process when it exists; E39 documents the
   current privileged-account lifecycle gap.
2. Confirm who holds `FEEDBACK_EXPORT_KEY` and whether each holder still needs
   private export access.
3. Rotate the export key after a holder leaves, a workstation is lost, a key may
   have entered history/logs, or access cannot be accounted for.
4. Record the review through the approved company security evidence process.
   Do not claim the general Admin Audit Log is complete while E37 remains open.

## Production release sequence

E32 currently blocks this sequence because the supplied SSH identities do not
establish an authorized server session. Do not skip a step when access returns.

1. Confirm the host and deployment directory are the onService Onsite App, not
   another onService or neighboring application. Record the deployed Git SHA,
   compose project, container names, Nginx configuration path, database target,
   and upload-volume path without printing secrets.
2. Run a read-only inventory:
   - count feedback rows with top-level or item screenshot references;
   - list unique referenced filenames without exporting tester text or contact;
   - count matching files, missing references, unreferenced files, non-files,
     and symlinks under `uploads/feedback/`;
   - record only aggregate counts and masked identifiers in the deployment log.
3. Back up and verify recovery for:
   - the production database;
   - the complete uploads volume, including feedback evidence;
   - deployed environment/configuration without exposing secret values;
   - Nginx configuration and the current deployed Git state.
4. Deploy the API, Admin build, and public feedback form support as one release
   while retaining the existing direct Nginx behavior temporarily. The updated
   Admin sends the selected record version with every triage decision and the
   updated API requires it, so do not deploy only one side of that contract.
5. Before changing Nginx, verify through authenticated/private paths:
   - an old absolute storage identifier renders in its correct Admin record;
   - a current relative identifier renders in its correct Admin record;
   - an unreferenced filename returns 404 from the Admin proxy;
   - a missing/invalid Admin session cannot retrieve evidence;
   - the private pull downloads existing screenshots with the header key;
   - a query-string key cannot retrieve a screenshot;
   - a newly uploaded file previews locally and remains readable after
     submission through its Admin record.
6. Validate the new Nginx configuration, then reload it. Do not replace the
   whole host configuration or alter unrelated application vhosts.
7. Verify both `app.onservice.ph` and `api.onservice.ph`:
   - direct `/uploads/feedback/<known-file>` returns 404 with
     `Cache-Control: private, no-store`;
   - authenticated Admin retrieval still returns the file with
     `private, no-store` and `X-Content-Type-Options: nosniff`;
   - private header-key retrieval still works;
   - ordinary non-feedback public uploads still return normally;
   - neighboring applications and their health checks are unaffected.
8. Run the relevant API/Admin tests and protected repository gates, then record
   the deployed SHA and evidence. Do not call E52 production-resolved until all
   checks pass.

## Rollback

If protected retrieval fails after the Nginx reload, restore the prior Nginx
configuration from the verified backup and reload it while keeping the new API
and Admin code in place for diagnosis. Do not delete or rewrite evidence as a
rollback. If privacy containment must be temporarily rolled back, restrict host
access at the infrastructure layer and treat the incident as an active privacy
risk until the direct prefix can be blocked again.
