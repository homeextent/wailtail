# Developer & Git Cheat Sheet — Wailtail

## Branch & Release Workflow (`staging` -> `main`)
- **Active Development Worktree (`staging`):** All feature work, bug fixes, refactors, and AI agent sessions (**Antigravity** and **Roo Code**) MUST run inside `/media/jeremy/MEDIA/dev/repos/wailtail-staging` on **`staging`** (or a short-lived `feature/*` branch merged into `staging`).
- **Primary Shared Repository (`wailtail-auction`):** `/media/jeremy/MEDIA/dev/repos/wailtail-auction` holds the shared `.git` database for the linked `wailtail-staging` worktree. **Do not delete `wailtail-auction`.**
- **Protected Production Branch (`main`):** Production (`https://www.wailtail.com`) is live on Vercel. Pushing or merging to `main` triggers an immediate production deployment. Never commit directly to `main`.
- **AI Agent Pre-Flight Rule:** Before modifying any files, Antigravity and Roo Code must verify `git branch --show-current` is `staging` (or an active task branch off `staging`) with a clean `git status -sb`.

**Standard Development Loop (on `staging`)**
```bash
cd /media/jeremy/MEDIA/dev/repos/wailtail-staging
git checkout staging
git pull --ff-only origin staging
git add .
git commit -m "feat/fix/docs: description of work"
git push origin staging
```

## Production Promotion Loop (`staging` -> `main` -> Vercel Production)
1. Verify changes in the isolated emulator preview (`npm run test:seller-browser`) and run `npm run build` + `npm run lint`.
2. If `firestore.rules` changed, deploy rules separately before promoting (`npm run deploy:rules`).
3. Merge `staging` into `main` and immediately return to `staging`:
```bash
git checkout main && git pull origin main && git merge staging --no-edit && git push origin main && git checkout staging
```

## Local Development & Emulator Testing
- **Safe Localhost Emulator Preview** (Recommended — Auth 9099, Firestore 8080, Storage 9199): `npm run test:seller-browser`
  - Public catalog: `http://127.0.0.1:4178/catalog?actor=public`
  - Admin inventory: `http://127.0.0.1:4178/admin?tab=inventory`
  - Seller draft editor: `http://127.0.0.1:4178/?fixture=draft`
- **Vite Dev Server** (connects to configured Firebase project — use caution): `npm run dev`
- **Build & TypeScript Check**: `npm run build`
- **ESLint Check**: `npm run lint`
- **Test Suites**: `npm run test:endpoint`, `npm run test:rules`, `npm run test:seller-emulator`, `npm run test:auction-browser`
- **Detailed Worktree & Recovery Guide**: See `docs/local-development.md`

## Firebase & Infrastructure Invariants
- **Firebase / GCP Project**: `studio-apps-483721` (Firestore DB: `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`)
- **Deploy Firestore Rules Separately**: `npm run deploy:rules` (Vercel deployments do NOT update security rules)
- **Currency Standard**: All reserves, bids, fees, and financial calculations are strictly **CAD ($)**.
- **Worktree Repair** (if parent folders ever move):
```bash
git -C /media/jeremy/MEDIA/dev/repos/wailtail-auction worktree repair /media/jeremy/MEDIA/dev/repos/wailtail-staging
```

## Roo Code Workflow
- **Branch Check**: Confirm `git branch --show-current` is `staging` before starting any task.
- **Mode Selection**: Use Architect Mode for audits, then switch to Code Mode for targeted edits (max 3–5 files per directive).
- **Model Selection**: Use `gemini-flash-latest` with thinking tokens capped (~3,000–4,000) and auto-condense threshold set to 40%.
- **Documentation Sync**: Batch updates to `SYSTEM_BIBLE.md`, `CHANGELOG.md`, and `README.md` into a dedicated milestone task on `staging` prior to promoting to `main`.
