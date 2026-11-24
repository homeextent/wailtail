# CI-01 — Change-aware CI

Candidate for staging review; production promotion remains separately authorized.

The existing CI workflow and job name (Build, lint and test) remain unchanged. Every push and PR targeting staging/main still triggers CI. The checkout includes history; PRs compare the event base against the checked-out merge commit, pushes compare the event before SHA against the checked-out head. Manual dispatch, empty/unknown diffs, deletions, executable files, symlinks and all paths outside the explicit Markdown allowlist take the full existing test path. Workflow and classifier changes always take the full path. Ordinary additions/modifications to README.md, CHANGELOG.md, SYSTEM_BIBLE.md, DEVELOPER.md and conventional Markdown paths under docs/ qualify for lightweight UTF-8/nonempty/binary and git diff whitespace validation. Classifier regression tests run in both modes.

No application, security-rule, dependency or infrastructure testing is removed for full-mode runs. Existing npm caching is retained; emulator caching is deferred until independently benchmarked. No deployment behavior is changed.

Acceptance: full CI on this implementation PR; then a documentation-only PR and a manual dispatch on staging to verify both modes, required check continuity and actual elapsed times before production promotion. Do not claim a measured speed improvement before that evidence exists.
