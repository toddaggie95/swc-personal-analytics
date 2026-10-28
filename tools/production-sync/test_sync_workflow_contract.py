import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[2]
class WorkflowContractTests(unittest.TestCase):
 def test_sync_runs_after_has_before_accept(self):
  workflow=(ROOT / ".github/workflows/swc-production-dry-run.yml").read_text()
  self.assertLess(workflow.index("Apply and verify HAS updates"), workflow.index("Synchronize and verify production Started flags"))
  self.assertLess(workflow.index("Synchronize and verify production Started flags"), workflow.index("Accept verified export batch"))
 def test_bidirectional_sync_is_implemented(self):
  code=(ROOT / "tools/production-sync/sync-production-started.py").read_text()
  self.assertIn('desired="Yes" if status=="running" else ""',code)
  self.assertIn('{"toYes":',code)
  self.assertIn('if current!=desired:',code)

if __name__=="__main__":unittest.main()
