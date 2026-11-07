# Local development and worktree housekeeping

## Branches, folders and the shared repository

`staging` integrates reviewed development. `main` is production and receives separately approved releases. A folder can hold either branch, a task branch or a detached commit; its name does not establish Git state.

Linked worktrees share Git history, branches and stash through the primary repository. They have separate working files and indexes. Do not delete the primary repository while linked worktrees still depend on it. Local archive branches and stashes are not remote backups unless explicitly exported or pushed.

## Daily workflow

Open the active development folder in VS Code. First run:

```bash
git status -sb
git branch --show-current
git worktree list
```

If clean and already on `staging`, synchronize it:

```bash
git fetch origin
git pull --ff-only origin staging
```

If on a different branch, account for local changes before switching. If Git says staging is already checked out in another worktree, use that worktree instead. Stop on divergence or unexpected changes; do not force an update.

Create a focused task branch from the updated staging checkout, for example:

```bash
git switch -c feature/m2-1-consignment-review
```

Use a new task name if the example already exists. Keep edits on that branch, run checks appropriate to the change, and submit a PR targeting `staging`. Verify checks on the exact proposed commit and obtain merge authorization. After merging, return to a clean staging checkout and fast-forward it before the next task. A new feature branch in the same worktree does not require another folder.

## Safe localhost preview

Requirements: Node.js 22, npm and Java 21. With dependencies installed using `npm ci`, run:

```bash
npm run test:seller-browser
```

Keep the terminal running and use the printed URLs:

| View | URL |
|---|---|
| Public catalog | http://127.0.0.1:4178/catalog?actor=public |
| Administrator inventory | http://127.0.0.1:4178/admin?tab=inventory |
| Seller draft editor | http://127.0.0.1:4178/?fixture=draft |

The harness seeds synthetic users and listings, automatically signs in the appropriate synthetic actor, and uses candidate rules against `demo-wailtail-stage3` on guarded loopback endpoints: Auth 9099, Firestore 8080 and Storage 9199. These actors and authentication shortcuts belong only to the test harness. The port-4178 preview is not the production catalog. Stop it with Ctrl+C. If required ports are occupied, stop the existing development instance rather than changing emulator safety guards.

`npm run dev` is a different mode. Vite uses the checked-in Firebase configuration; its local plugin serves email and YouTube handlers, while other API requests proxy to port 3000 or the `VERCEL_URL` host when set. A frontend running on localhost is not evidence that its backend or data is isolated. Verify API, project, named Firestore database and bucket targets before mutation testing. Do not point a synthetic mutation test at live services or copy archived credentials into this setup casually.

Build/lint and the endpoint, rules, seller-emulator and auction-browser suites are available through the package scripts. CI runs these checks. Choose focused verification for the change; documentation-only edits require source consistency, command/link inspection and a clean diff, rather than new application tests.

## Move or retire a linked worktree

1. Inspect branch, commit, tracked edits, untracked files and ignored filenames with `git status -sb`, `git status --short --ignored`, `git log -1 --oneline` and `git worktree list`. Do not paste credential contents.
2. Identify commits outside staging before deleting branches or detached worktrees. Preserve unique history on an archive branch or in a verified Git bundle. Stashing selected tracked edits preserves them locally but is not a backup of ignored or untracked files.
3. Stop servers and close VS Code for the worktree being moved or retired. Use absolute paths for Git's repository, source and destination arguments. Confirm the destination does not already exist.
4. For a move, use `git -C /absolute/primary/repository worktree move /absolute/source /absolute/destination`. Verify status, commit and worktree registration afterward. Relative destinations are resolved after `-C`; this previously placed staging inside the primary repository by mistake. Do not rerun a move blindly if a folder disappears: inspect `git worktree list` first.
5. Before retirement, create an owner-only backup directory outside the repository (`umask 077` and `mktemp -d`). Archive the worktree, including `.env*`, `.vercel`, local scripts and manifests if present. Generated `node_modules/` and `dist/` may be excluded when dependencies/builds are reproducible. Keep logs needed for evidence. Preserve any external files referenced by symlinks separately if needed; a tar archive normally preserves the link, not its target.
6. Verify the archive against its source using `tar -dzf /absolute/backup/worktree.tar.gz -C /absolute/worktree`. For exported history, use `git bundle verify /absolute/backup/history.bundle`. Stop on any failure or unexplained differences. A worktree archive's `.git` pointer is not a substitute for the primary repository or a complete Git bundle.
7. Remove only the specific retired worktree using `git worktree remove`. Use `--force` only when intentionally removing the already-verified archived local files that prevent normal removal. Never use a blanket cleanup, `git clean`, `reset --hard` or file-manager deletion to bypass this review.
8. Recheck `git worktree list` and the active staging status. Decide remote branch/PR disposition separately; removing a worktree does not delete its branch or close a PR.

Keep secret-bearing backups outside version control and do not attach them to public issues or PRs. Restricted directory permissions alone are not encryption. A verified local archive protects this cleanup, but is not an off-device disaster-recovery backup.

## Recovery

Inspect archives privately before extracting. Extract into a new owner-only directory, not over the active workspace. Restore source/settings selectively after checking their purpose and environment scope. An archived `.git` pointer may refer to a worktree registration that has been removed; do not treat the extracted folder as an active checkout.

A complete history bundle can be cloned into a new directory. Alternatively, create a fresh linked worktree at a preserved archive branch, then restore the required local files there. For the seller edits preserved in the shared stash, inspect `git stash list` and `git stash show` in the primary repository; do not blindly apply them to staging because their equivalent changes are already included.

## Jeremy's confirmed local inventory — November 7, 2026

These paths record the owner's reported setup. Other developers should use their own absolute paths.

| Location or reference | State and purpose |
|---|---|
| `/media/jeremy/MEDIA1/GITHUB/wailtail-staging` | Active linked development worktree; clean staging at `1bf4d6a` after PR #3. It will advance with later merges. |
| `/media/jeremy/MEDIA1/GITHUB/wailtail-auction` | Primary shared repository; clean detached checkout at `02ff8b7`, not a confirmed main checkout. Retain it while linked staging depends on it. |
| Shared stash: `Archived local seller edits already included in staging 1bf4d6a` | Two tracked seller edits preserved; their equivalent changes are already in staging. Stash numbers can change. |
| Local branch `archive/review-worker-22f3850` | Preserves the retired worker-test commit. Not automatically pushed. |
| `/media/jeremy/MEDIA1/GITHUB/wailtail-worker-backup-7FT0Vp/worktree.tar.gz` | Verified private worker archive, including local settings. Worker worktree removed. |
| `/media/jeremy/MEDIA1/GITHUB/wailtail-rehearsal-backup-lOPuPE/worktree.tar.gz` | Verified rehearsal source/scripts/manifest/log archive; generated dependencies/build output excluded. Rehearsal worktree removed. |
| Same rehearsal backup directory: `rehearsal-history.bundle` | Verified complete history containing `security/stage3-closeout` at `f28702d`. |

The only remaining registered worktrees at housekeeping completion were the primary repository and active staging. GitHub still retained `security/auction-security-gate`, `test/review-worker-https` and `security/stage3-closeout`; removal of local worktrees did not retire remote branches. PR #2 remained open and separate. Recheck current remote state before any future branch/PR cleanup.

## Firebase environments and release boundary

Retain `wailtail-stage3-test` for separately controlled real-cloud Storage checks and the unresolved production Storage cutover. It is not required for the routine emulator workflow. Before reusing it, inspect its current objects, rules and billing state; those were not reverified by this local housekeeping procedure. Confirm deny-all rules when no test specifically needs temporary access.

Merging source into staging does not publish Firebase rules, copy production media, revoke production download tokens or activate worker schedules. Those remain separately authorized release operations. The completed staging security milestone allows the feature roadmap to resume at M2.1; it does not complete dealer milestones M2.1–M2.5.
