"""Conservative CI classification; only ordinary, explicitly allowed Markdown edits qualify."""
import os
import re
import subprocess
import sys

ROOT_DOCS = {b"README.md", b"CHANGELOG.md", b"SYSTEM_BIBLE.md", b"DEVELOPER.md"}
DOC_PATH = re.compile(rb"docs/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.md")

def git(*args):
    return subprocess.check_output(["git", *args], stderr=subprocess.DEVNULL)

def classify(base, head):
    if not all(re.fullmatch(r"[0-9a-f]{40}", sha or "") and sha != "0"*40 for sha in (base, head)):
        return "full"
    try:
        raw = git("diff", "--raw", "--no-renames", "-z", base, head, "--")
        fields = raw.split(b"\0")
        if not raw or fields.pop() != b"" or len(fields) % 2:
            return "full"
        for meta, path in zip(fields[::2], fields[1::2]):
            parts = meta.split()
            # Only additions/modifications of ordinary non-executable files.
            if len(parts) != 5 or parts[1] != b"100644" or parts[4] not in (b"A", b"M"):
                return "full"
            if parts[0] != (b":000000" if parts[4] == b"A" else b":100644"):
                return "full"
            if path not in ROOT_DOCS and not DOC_PATH.fullmatch(path):
                return "full"
        return "docs"
    except (OSError, subprocess.CalledProcessError, ValueError):
        return "full"

def main():
    mode = classify(os.getenv("CI_BASE"), os.getenv("CI_HEAD")) if os.getenv("CI_EVENT") in ("push", "pull_request") else "full"
    print(f"CI mode: {mode}")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"mode={mode}\n")

if __name__ == "__main__":
    main()
