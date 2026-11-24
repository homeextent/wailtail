import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from classify import classify, git

class ClassificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        old = os.getcwd()
        os.chdir(self.temp.name)
        self.addCleanup(os.chdir, old)
        git("init", "-q")
        git("config", "user.email", "ci@example.invalid")
        git("config", "user.name", "CI")
        Path("README.md").write_text("base\n")
        self.base = self.commit()

    def commit(self):
        git("add", "-A")
        git("commit", "-qm", "fixture")
        return git("rev-parse", "HEAD").decode().strip()

    def test_docs(self):
        Path("README.md").write_text("updated\n")
        Path("docs").mkdir()
        Path("docs/guide.md").write_text("# Guide\n")
        self.assertEqual(classify(self.base, self.commit()), "docs")

    def test_mixed(self):
        Path("README.md").write_text("updated\n")
        Path("firestore.rules").write_text("rules")
        self.assertEqual(classify(self.base, self.commit()), "full")

    def test_nonallowlisted(self):
        Path("package.json").write_text("{}")
        self.assertEqual(classify(self.base, self.commit()), "full")

    def test_deleted(self):
        Path("README.md").unlink()
        self.assertEqual(classify(self.base, self.commit()), "full")

    def test_symlink(self):
        Path("README.md").unlink()
        Path("README.md").symlink_to("elsewhere")
        self.assertEqual(classify(self.base, self.commit()), "full")

    def test_executable(self):
        Path("README.md").chmod(0o755)
        self.assertEqual(classify(self.base, self.commit()), "full")

    def test_empty_unknown_and_failure(self):
        self.assertEqual(classify(self.base, self.base), "full")
        self.assertEqual(classify("0"*40, self.base), "full")
        self.assertEqual(classify("a"*40, self.base), "full")
        with patch("classify.git", side_effect=OSError):
            self.assertEqual(classify(self.base, self.base), "full")

if __name__ == "__main__":
    unittest.main()
