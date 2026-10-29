import csv
import tempfile
import unittest
from pathlib import Path
from importlib.machinery import SourceFileLoader

module = SourceFileLoader("compare_exports", str(Path(__file__).with_name("compare-exports.py"))).load_module()

class ShadowComparatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manual = self.root / "manual"
        self.api = self.root / "api"
        self.manual.mkdir()
        self.api.mkdir()
        for name in module.KINDS:
            fields = ["uid", "owner_uid", "quantity", "productionStatus"]
            self.write(self.manual / (name + ".csv"), fields, [["16:1", "20:1174", "10", "running"]])
            self.write(self.api / (name + ".csv"), fields, [["16:1", "20:1174", "10", "running"]])

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def write(path, fields, rows):
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(fields)
            writer.writerows(rows)

    def test_identical_exports_pass(self):
        self.assertTrue(module.compare(self.manual, self.api)["safeToPromote"])

    def test_quantity_change_fails(self):
        self.write(self.api / "TJO-Materials.csv",
                   ["uid", "owner_uid", "quantity", "productionStatus"],
                   [["16:1", "20:1174", "11", "running"]])
        result = module.compare(self.manual, self.api)
        self.assertFalse(result["safeToPromote"])
        self.assertEqual(result["files"]["TJO-Materials"]["criticalFieldMismatchCounts"]["quantity"], 1)

    def test_missing_station_fails(self):
        self.write(self.api / "TFF-Stations.csv",
                   ["uid", "owner_uid", "quantity", "productionStatus"], [])
        self.assertFalse(module.compare(self.manual, self.api)["safeToPromote"])

    def test_missing_column_fails(self):
        self.write(self.api / "TJO-Stations.csv", ["uid", "quantity"], [["16:1", "10"]])
        self.assertFalse(module.compare(self.manual, self.api)["safeToPromote"])

    def test_duplicate_uid_fails(self):
        self.write(self.api / "TFF-Materials.csv", ["uid", "quantity"],
                   [["16:1", "10"], ["16:1", "10"]])
        self.assertFalse(module.compare(self.manual, self.api)["safeToPromote"])

if __name__ == "__main__":
    unittest.main()
