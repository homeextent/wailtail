# Consolidated Storage cutover execution package

Status: preparation/implementation only. No live-operation approval, writes, configuration changes, production promotion, scheduler activation or real email have occurred in this task. PR #16 preparation acceptance remains complete; this package is its focused execution follow-up, not another inventory project. The three stages below replace separate documentation/approval rounds. One explicit approval may cover the exact plan plus named production actions; native phase checks still stop unsafe later operations.

## 1. One preparation package

Use the reviewed clean checkout of this branch or its accepted staging merge. The existing private backup remains unchanged. Run only this read-only capture before live approval:

```bash
umask 077
package_dir="$(mktemp -d "$HOME/wailtail-cutover-package-XXXXXX")" &&
python3 scripts/storage_cutover_execution.py prepare \
  --backup /home/jeremy/wailtail-cutover-backup-xp8f4p6w \
  --package "$package_dir/package"
```

`prepare` needs standard-library Python and gcloud authentication; it does not re-download the 163 source files or require Pillow/PyMuPDF. It checks the original 169-file backup, copies that verified source evidence into the new private package, refreshes the 226-object inventory/generations/metagenerations, privately backs up full original metadata/ACL/token information, and stops on public ACLs, missing token backups or unexpected object contexts. It captures the exact deployed named-Firestore and bucket rule releases/sources, current composite indexes, bounded document/reference snapshot and review/notification backlog. Missing API permission or release/source evidence stops preparation; it is not silently waived.

Rules backup reads explicitly send `X-Goog-User-Project: studio-apps-483721`, as required for local user credentials without a quota-project default. Rules and index inventory checks run before the 226 per-object metadata reads so access/compatibility failures stop early. The index request uses `pageSize=0`, as required by the owner-observed named database backend; document listing keeps its independent bounded pagination. This selects the existing project for request quota; it does not change IAM, enable an API or edit local ADC configuration.

It checks all 163 destinations are absent, rebuilds the six exact whole-field reference writes/recovery fields from the current snapshot, and rechecks source/document revisions. Changed references or source metadata must be reconciled rather than bypassed. Worker counts/live-status counts flag operational review, not proof that there are no active bids or external writers. This is a fresh bounded preflight, not a full database backup.

Outputs are 0700 directories / 0600 files, outside Git. They contain credentials/token-bearing URLs and personal data: do not upload or commit them. Only `approval-summary.json` is shareable. The private plan pins the project, database, bucket, manifest, candidate Git SHA/tree, execution-tool hashes, release-file hashes, original snapshot hashes, 163 create-only copies, six document writes and conditional recovery, and 226 original token-key removals. It proposes no source deletion or IAM/ACL change. Token removals affect legacy links; do not approve this scope without reviewing external consumers and the 63 held sources.

Before approval, make an owner-controlled off-device copy of the **complete package**, including `verified-source-evidence`, `integrity-sha256.json` and private originals. `--verified-package-backup` later checks all sealed file checksums and rejects group/world-accessible package directories/files; the operator must separately confirm that this really is independent off-device storage. A second folder on the same disk is insufficient. The executor mirrors every started/completed operation journal entry and fsyncs both copies. It cannot prove physical storage independence or encryption.

### Current release observation — November 14, 2026

Read-only Vercel inspection reconfirmed `www.wailtail.com` on deployment `dpl_38Du9LUijfqRhwedLuUecpfqPf3S`, source `fef05a54dabea0792f9aac468277426c6591df47`. Project/team: `prj_v6gYqB0aidk53EJGuGx1lTU7hEIx` / `team_rUjpTkSZJJVhdZssqvSOjoGA`. These are dated observations; refresh them before live authorization.

Production environment metadata (no decrypted values requested; hidden production variable count zero) still lacks `FIREBASE_STORAGE_BUCKET`, `CRON_SECRET`, and `AUCTION_REVIEW_RECIPIENT`. Firebase Admin and Resend key entries exist; their presence is not credential or delivery verification. Proposed approval values/actions:

| Setting/action | Proposed scope |
|---|---|
| Storage binding | Set production-only `FIREBASE_STORAGE_BUCKET=studio-apps-483721.firebasestorage.app` |
| Worker credential | Generate a fresh production-only secret privately; set `CRON_SECRET`; never expose it in Git, terminal output, approval summary or command arguments |
| Review mailbox | Proposed `jeremy@theinnovativegroup.ca`; owner confirms it in the combined approval before any real mail |
| Index | Publish only the checked-in named-database index configuration; wait until the dealer verification audit index is READY; do not delete unrelated live indexes |
| Production app | Promote the reviewed candidate **tree** named in the private plan through the staging-to-main release PR; record resulting Git SHA/deployment ID; no unrelated changes |
| Maintenance | Controlled production pause/write-freeze and worker suspension during reference/rule/app transitions; review actual active auctions/bids first |
| Worker/mail | Proposed authenticated GET jobs: auction clock every minute, auction notifications every minute, review dispatch every five minutes. Existing scheduler configuration/location and backlog recipients must be checked before enabling; no unreviewed queue drain or scheduler replacement |

Do not claim the combined live approval is ready while the production candidate/deployment, mailbox, scheduler identities/recipients and independent backup are unresolved. Missing private values and scheduling facts can be resolved in this same task/PR, not separate planning PRs. No generic approval to "deploy everything" is requested. No email or scheduler tool is invoked by the executor.

## 2. One explicit approval

Present the sanitized plan SHA-256, candidate SHA/tree, exact 163/6/226 counts, preservation contract, complete backup verification, rule hashes/configs, production configuration actions, named maintenance/deployment actions, reviewed scheduler/mail scope, expected outage/observation window and stop/recovery procedure together. Approval must expressly cover production changes and the approved real-mail recipients, not merely staging merge. One approval authorizes **conditional phases in this order**, not blindly continuing after a failed check.

No apply command is appropriate until that approval exists. The executor requires all of:

- The exact `--approved-plan-sha256` from that approval and an unchanged tracked candidate tree/tools/release files.
- `--execute-approved-live-operation`, `--controlled-window-confirmed`, `--off-device-backup-confirmed` and an independently verified `--verified-package-backup` path.
- A private phase journal with no unmatched started operation, no conflicting process lock and matching mirrored journals.

Flags are operator acknowledgments, not proof of human approval, maintenance, deployment or physical backup independence. Do not fabricate them. The tool does not deploy/pause Vercel, publish rules/indexes, configure secrets or schedule jobs automatically.

## 3. One controlled execution window

| Order | Authorized action and required result |
|---|---|
| Pre-stage | Verify configuration, Firebase Admin target/project/database, real sender readiness, exact candidate and new index readiness. Keep workers paused. Review private workload/recipients and actual auction/bid state. Back up deployment/env metadata privately without printing secret values |
| Copies | Run executor phase `copy`. For each of 163 rows: refresh pinned source version, require destination absence, native rewrite with source generation/metageneration and destination generation-match zero; continue only server-issued rewrite tokens with identical guards/body. Record destination generation/metageneration before fresh checksum/decode/MIME/metadata/ACL and anonymous delivery checks. Completed receipts may be reverified; collisions and uncertain writes stop |
| Maintenance | Pause the production application and known writers/schedulers; verify no active user/bid operation is in flight. Publish the **maintenance** config only within this coordinated window: candidate Firestore rules plus `storage.cutover-freeze.rules` deny direct client writes while existing legacy/public media reads remain available. Admin SDK writers bypass client rules, so they must actually be paused/restricted; flags alone do not freeze them. A partially failed rules publication stops the window |
| References | Run phase `references`: reverify all destinations and the full original source set, rescan bounded current references, require exact original document revisions/fields, then one atomic six-write Firestore commit. Verify resulting changed fields/revisions and durably retain the per-write post-commit update times |
| Application | Deploy/promote the exact reviewed candidate; inspect new public routes, auth/assigned-dealer behavior and all six media consumers while maintenance remains in force. Do not expose the old direct-client frontend against new restricted Firestore rules as normal service; this transition is a deliberate maintenance window, not independent rule deployment |
| Final Storage rules | Publish `storage.cutover.rules` via `firebase.cutover.json` after all replacement delivery/references are verified. It preserves only `auctionPublic/{auctionId}/{assetId}` anonymous get, denies listing/client writes, and removes both legacy PDF exceptions. Verify all 226 originals reject token-free requests and all intended replacement media still load |
| Original tokens | Run phase `revoke`. Require verified references/copy receipts and strict no-token denial for every source first. Remove only `firebaseStorageDownloadTokens` using generation/metageneration-guarded PATCH, preserve all other metadata/bytes and all originals, then test every backed-up original token for denial. HTTP 200/206 or unexpected 404/redirect/network errors stop; do not call them successful privacy checks |
| QA/resume | Verify signed-out catalog/lot, both complete galleries (counts/order/PDF rendering), hero/showcases, common logo/promotions, five protected dependencies, retained Porsche album link and RAM exception. Verify direct unauthorized mutations/private access fail, trusted upload/remove and dealer review access work. Test bidding/lifecycle/settlement only against an explicitly approved test record, never an actual bid as a smoke test. Resume production only after checks pass; activate reviewed authenticated workers and bounded real-mail tests only under the approved scope |
| Observation | Record exact application/deployment/rules/index revisions, destination receipts, post-commit times, all denial outcomes, queue processing and confirmed mailbox delivery. Keep private journals/backups off-device. No source cleanup/deletion phase |

Use the local Firebase binary with explicit project/config only after approval. `firebase.cutover-freeze.json` selects the temporary maintenance rules, while `firebase.cutover.json` selects final rules; the normal `firebase.json` and `storage.rules` remain unchanged in this PR, so routine tests/deploys do not prematurely remove the accepted legacy exceptions. Index publication should be additive: refuse a prompt to delete unrelated indexes. Publishing rules/indexes is not atomic with Vercel promotion; the maintenance window and result checks bridge those steps.

The final rule state must become the future normal deployment configuration in the approved release follow-up; until then **do not run ordinary `firebase deploy --only storage`**, which selects the older `storage.rules`. This package's exact-config hashes prevent the executor silently switching policy, but cannot prevent an unrelated operator from deploying an older file.

### Stop and recovery rules

- All cloud writes have **no automatic network/auth retry**. Every write has a mirrored fsynced started marker before dispatch and a result afterward. An ambiguous result or process crash blocks normal resume. Inspect exact current destination generation, document revision or metadata and reconcile the private journals manually before a new attempt. Never delete a lock without proving the other process stopped; never remove started markers to force a retry.
- A completed copy can be resumed only from its recorded generation/metageneration and full verification. Unrecorded existing destinations are collisions, even when bytes match. Do not overwrite or delete them automatically.
- An atomic commit failure with uncertain response is not evidence of rollback. Read all six revisions/fields first. Do not issue a second commit blindly.
- Before any token removal, phase `recover-references` can restore original affected fields only at the recorded post-commit update times, after confirming the original URLs still work. Whole-field masks preserve unrelated data; native preconditions protect newer edits. This rollback is part of the exact approval scope and itself a live operation. It does not roll back application/rules automatically. Verify resulting fields/revisions and UI before resuming.
- After **any** revocation entry, automatic reference recovery is prohibited. Keep service in maintenance and forward-repair using retained originals and verified public copies. Do not restore old public-write rules, silently restore download tokens, roll back to the incompatible old frontend, delete originals, or treat a checksum test as a production restore drill.
- Enabling a worker can send queued email or settle auctions. Unknown queues/recipients, active bids or unknown external writers block that action; they are not waived by a media-only plan hash.

### Tested limits and source references

Offline tests exercise native request construction/guards, copy continuation and collisions, journal interruption/mirror checks, snapshot pins, reference/recovery field continuity, revision races, strict-denial gates, token-key-only patching, private output and sanitized failures. Isolated Firestore emulation exercises six-write native atomic commits, successful guarded recovery and rejection of stale revisions without partial changes. Isolated Storage emulation exercises final legacy denial/public delivery/client-write denial and temporary maintenance-read/write-denial behavior. These are **not live Google Cloud rewrite/token-removal or production restore results**. Owner-side native execution and final acceptance remain future approved actions.

Native API contracts: [Storage rewrite](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/rewrite), [request preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions), [metadata PATCH semantics](https://docs.cloud.google.com/storage/docs/json_api), [Firestore atomic commit](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit), [Firebase deployed rule releases](https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/get). No production rules/API calls were made from ChatGPT in this implementation.
