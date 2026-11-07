# Stage 3 staging security acceptance

Scope: PR #3, `security/auction-security-gate` into `staging`. Acceptance requires a final implementation review, successful required CI and a successful Vercel preview on the exact proposed commit. This document does not authorize production changes.

| Workflow | Staging disposition | Acceptance evidence |
|---|---|---|
| Public catalog, lot, bids and comments | Public field projection; canonical records remain private | Browser catalog/lot checks, projection and emulator assertions |
| Seller editor | Assigned UID, draft state and revision guards | Save/reload browser check; narrative, showcase, gallery order, video, upload, removal and review-state assertions |
| Administrator inventory | Trusted creation, update, duplication, scoped reset/deletion, media and retraction | Emulator authorization, transaction, isolation and failure checks |
| Watchlists | Authenticated, idempotent desired state; atomic aggregate update | Concurrent retry, private-draft rejection, banned-user denial and browser persistence |
| Account activity | Verified UID-scoped bids/wins; verified email-scoped submissions | Foreign identity spoofing and winner-contact isolation checks |
| Private inquiry | Durable inquiry and outbox in one transaction; canonical recipient, verified sender, interval limit | Spoofing, duplicate, throttle, rejection/no-writes and browser submission checks |
| Branding/promotions | Public branding allowlist; admin-only settings and trusted public image upload | Rules, projection, Storage read and browser branding save checks |
| Member administration | Existing designated-admin role/moderation rules; trusted account deletion | Admin/member rules matrix and account-deletion endpoint suite |
| Broad catalog and legacy bidder purge | Disabled before any client writes | Service guards, rules denial and disabled browser purge control |
| One-click consignment conversion | Disabled in both administrator interfaces and service entry points | Disabled controls; canonical client writes remain denied |
| Promotion click counters | Client writes disabled | Counters remain historical; promotions themselves remain usable |

Own-account activity reads are bounded to 500 bid records, 100 joined lots and 100 submissions per collection. The account hub indicates when the display limit is reached. Watchlists accept at most 500 entries. These are beta limits, not an assertion of unlimited historical reporting.

No customer emails are sent by automated tests. Notification transport tests mock provider responses. Live preview checks are read-only; authenticated mutation acceptance runs in loopback-only demo emulators.

Production release remains separate: activate and verify review/clock/notification workers, configure credentials, confirm real mailbox delivery, execute approved Storage migration/token revocation/cleanup, publish rules and perform production QA. PR #2 remains separate. Dealer-program milestones M2.1–M2.5 retain their existing roadmap definitions.
