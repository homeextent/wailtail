# Production Storage cutover evidence — November 16, 2026

## Disposition

The owner-authorized Storage migration, production rollout and bounded operational observation completed. This record distinguishes supplied owner evidence, independently observed deployment/public API state, and remaining program gates. It does not declare the Founding Dealer Pilot or formal Phase 1 complete.

## Approved plan and preservation

- Candidate: `3d961c4f616bf7c7c949fa2767795e6e306bd279`; tree `3eda00285449e8d80ef52cc905cfeabb2804104c`.
- Exact private plan SHA-256: `1bf3fc3ed66af5abd1301ba7574d09d262c6bcb943c93200d0f0052b327c637c`. Owner explicitly approved combined staging/production cutover scope and one review email on November 14.
- Owner executor reports: 163 public copies verified, six reference documents atomically updated, 226 original token paths revoked and denied. All 226 originals, including 63 held sources, remain preserved. No object deletion, IAM/ACL mutation or token restoration was performed.
- Five protected lot-test dependencies were retained through the approved public mapping. The RAM invoice's narrowly approved content exception remains; replacement-upload support and personal-information upload guidance are separate follow-ups.
- The Porsche PDF's Google Photos album link and the listing's Google Drive Cloud Dossier URL are distinct. Owner confirmed media/PDF/album delivery during QA; native before/current comparison proved the dossier field unchanged. PR19/20 corrected its public API omission, and owner confirmed the visible link opens after deployment. No listing-data rewrite was needed.
- Complete sealed package and source evidence were verified on the home/system disk and within an owner-controlled encrypted LUKS2/ext4 container on a separate internal SATA disk. Journals were mirrored. This is independent-drive recovery evidence, not off-computer disaster recovery or a production restore drill. Private token-bearing backups and credentials remain outside Git.

## Deployment and policy evidence

| Item | Recorded result |
|---|---|
| Initial application release | PR18 main merge `c48bd2e92935b566600574c697d59d12c325cee1`; deployment `dpl_CvkzeBfU2BnNqtN7Xqgvc8Q3p3ZP` READY |
| Dossier fix | PR20 main merge `b866d1c8a7b34a2dc409cb11c6bb246f01674334`; deployment `dpl_6M7svuppPuwAytcoycpRPkgLrxZK` READY |
| Polling fix | PR22 main merge `88314cebe67a3095a609c4663b5575687cb04f95`; deployment `dpl_Evk9vg4AghpPnM6TKDLWZfAC5LMN` READY on www.wailtail.com |
| Firestore binding | Owner compared deployed source on named database `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`; ruleset `f63e4af7-d0a5-494a-9125-eefdaaa84302` |
| Index | Owner verified COLLECTION index `dealer_verification_audits`, caseId ASC/revision DESC, READY |
| Maintenance Storage | Owner source-verified ruleset `6c8e931a-692c-453f-b74b-101606566cad` before references |
| Final Storage | Owner source-verified `storage.cutover.rules`, ruleset `a0f440aa-3b76-4420-bc77-fed961df5df9`; public get only under auctionPublic, no legacy exceptions or client writes |
| Production configuration | Explicit bucket binding, private CRON_SECRET and review recipient configured for Production; values/secrets not copied into this record |

The ordinary `storage.rules` is now byte-identical to the deployed final cutover source. `firebase.json` still selects that ordinary file. A regression asserts parity so a routine Storage deploy cannot accidentally reinstate the two pre-cutover PDF exceptions. This source alignment does not publish a new live ruleset. Do not rerun sealed migration phases against the evolved source tree; token revocation is complete and automatic reference recovery is prohibited.

## Mail, scheduling and observation

Resend's wailtail.com domain was owner-confirmed Verified. On November 16 one isolated synthetic review event was atomically created without modifying a real auction. Authenticated dispatch returned processed=1/pending=0; Jeremy confirmed actual inbox receipt at jeremy@theinnovativegroup.ca from Wailtail Curation <consignments@wailtail.com>. Native readback confirmed event status sent and both queues empty. Do not resend it as a smoke test.

| Cloud Scheduler job (us-central1, Etc/UTC) | Schedule | State |
|---|---|---|
| wailtail-auction-clock | every minute | ENABLED |
| wailtail-auction-review | every five minutes | ENABLED |
| wailtail-auction-notifications | every minute | PAUSED; activation not authorized |

Jobs were created with a future temporary schedule, paused, then assigned the approved cadence, since job state is output-only on creation. Owner verified PAUSED/no prior attempts before activation. Requests use HTTPS GET and a private bearer credential; retryCount and maxRetryDuration were configured zero, with 60-second attempt deadline. No secret values are logged here.

Jeremy identified Porsche and RAM as his own test auctions. A guarded manual clock check verified the exact workload and future end times before dispatch; result processed=1/pending=0/remaining=0. Readback confirmed Porsche active and RAM upcoming, with both queues empty. No real bid or settlement smoke test was placed.

Temporary maintenance allowed only the owner's connection; an external API request was denied403. After approved removal, an independent external catalog request returned200 with active/upcoming listings. Owner then enabled only clock and review jobs. Final owner evidence after more than30 minutes: clock lastAttemptTime `2026-11-16T16:57:02.995738Z`, review `2026-11-16T16:55:03.886912Z`, both ENABLED with empty success status; notifications PAUSED with no attempt; both queues empty. This is sampled latest-status evidence, not a complete historical job-success ledger.

Five unauthenticated production worker/admin/narrative endpoint checks returned401 before the mail test. Owner fresh-browser checks covered intended media delivery after revocation. The native executor denied all backed-up original token paths; emulator tests are not substituted for that live evidence.

## Quota incident and limits

The AI-shared-quota database returned RESOURCE_EXHAUSTED on November14/15 despite the project being on Blaze. No paid-database upgrade was authorized or performed. Reads recovered on November16. PR21/22 reduced non-live detail polling to60 seconds and added failed-request backoff while preserving live five-second cadence. Overnight caller attribution remains unconfirmed; retained Vercel logs did not cover the spike. See [read-budget analysis](public-read-budget.md).

Final owner screenshot (last24 hours, November15–16) displays860 reads,6 writes and0 real-time reads, with roughly140–210 reads/hour in the visible recent buckets. It supports a much lower observed read rate than the earlier spike; it is not an exact reset-day quota ledger, causal attribution or guarantee of future capacity. Keep watching usage as genuine traffic grows. A shared-quota upgrade would require a separate cost decision.

## Remaining work

- Merge the ordinary-policy alignment and evidence synchronization through normal staging/release approvals; live final policy already remains in force.
- Keep auction notification dispatch paused until explicit recipient/workload review and authorization. Clock can later settle test auctions and enqueue winner notifications; paused delivery is an accepted boundary, not notification completion.
- Full production dealer workflow acceptance, trusted corrected-PDF upload compatibility, and 3–5 Founding Dealer Pilot/KPIs remain distinct from this operational cutover evidence. M2.6 remains optional and separately gated.
- Retain private recovery package/journals and owner-managed passphrase. No cleanup/deletion or automatic old-token restoration is authorized by closeout.
