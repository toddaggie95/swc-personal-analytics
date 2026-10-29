"""Regression tests for accepted export fingerprint matching."""
import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).with_name("check-new-batch.py")
spec = importlib.util.spec_from_file_location("check_new_batch", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BatchFingerprintTests(unittest.TestCase):
    def setUp(self):
        self.files = [
            {"owner": owner, "kind": kind, "id": owner + kind, "sha256": "digest-" + owner + kind}
            for owner in ("TFF", "TJO") for kind in ("Stations", "Materials")
        ]

    def test_reordering_does_not_change_identity(self):
        self.assertEqual(module.identity(self.files), module.identity(list(reversed(self.files))))

    def test_new_content_is_detected(self):
        changed = [dict(item) for item in self.files]
        changed[0]["sha256"] = "new-digest"
        self.assertNotEqual(module.identity(self.files), module.identity(changed))

    def test_new_export_file_id_is_detected(self):
        changed = [dict(item) for item in self.files]
        changed[0]["id"] = "replacement"
        self.assertNotEqual(module.identity(self.files), module.identity(changed))

if __name__ == "__main__":
    unittest.main()
