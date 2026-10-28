#!/usr/bin/env python3
"""Check the accepted HAS verification script matches the ledger upload layout."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]

class AcceptedHasArtifactLayoutTests(unittest.TestCase):
    def test_verifier_reads_manifest_from_uploaded_subdirectory(self):
        workflow = (ROOT / ".github/workflows/swc-production-dry-run.yml").read_text()
        verifier = (ROOT / "tools/production-sync/verify-accepted-batch.sh").read_text()
        self.assertIn("${{ runner.temp }}/swc-exports/export-manifest.json", workflow)
        self.assertIn("os.path.join(folder,'swc-exports','export-manifest.json')", verifier)

if __name__ == "__main__":
    unittest.main()
