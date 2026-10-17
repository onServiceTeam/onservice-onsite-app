# Ken's decisions during the customer review, 2026-10-17

## S1. Request media storage is not a blocker (Ken, 2026-10-17, in chat)

> regarding the storage dont worry about that since we will eventually connect the data to storage boxes with hetzner later and for now we are just trying to build the product and can re-route storage later

What this means for the build:

- Use Ken's limits for the Book a Service form:
  - up to 20 photos;
  - up to 2 videos, each up to 5 minutes, recorded in the app or picked from the phone, large files, common formats;
  - a voice note of up to 5 minutes.
- Keep the storage location in one place in the code, behind the existing upload service, so that moving uploads to a Hetzner Storage Box later is a configuration change, not a rewrite.
- Make the limits admin-editable settings where the request engine already reads its limits from settings (standing rule: database-backed configurable things get an admin editor).
- Not a blocker, recorded for safety:
  - the tester server's disk is shared with other businesses and was 84% full on 2026-10-16;
  - a simple free-space guard (refuse new uploads with a clear message when the disk is nearly full) protects the other businesses on the same server until the Storage Box move;
  - this is a guard, not a limit change.
