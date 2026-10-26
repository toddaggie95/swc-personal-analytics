import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("exports", Path(__file__).with_name("download-drive-exports.py"))
exports = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exports)

STATION = "uid,name,owner_name,type_name,system,sysX,sysY,tooled-to\n5:1,Yard,{owner},Shipyard IV,Kashyyyk,2,3,Alpha\n"
MATERIAL = "uid,quantity,type_name,container_type_name,container_uid,owner_name\n16:1,50,meleenium,Stations,5:1,{owner}\n"
OWNERS = {"TFF": "The Faerytail Family", "TJO": "The Faerytail Family: The Je`daii Order"}

class ClassificationTests(unittest.TestCase):
    def test_all_four_random_names(self):
        files = []
        for owner, name in OWNERS.items():
            for kind, template in (("Stations", STATION), ("Materials", MATERIAL)):
                files.append(({"id": owner+kind, "name": "inventory-export-"+owner+kind+".csv"},
                              template.format(owner=name).encode()))
        found = exports.discover(files)
        self.assertEqual(set(found), set(exports.TARGETS))
    def test_duplicate_rejected(self):
        file = ({"id": "1", "name": "a.csv"}, STATION.format(owner=OWNERS["TFF"]).encode())
        with self.assertRaisesRegex(ValueError, "duplicate"):
            exports.discover([file, file])
    def test_missing_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing exports"):
            exports.discover([])
    def test_mixed_ownership_rejected(self):
        body = STATION.format(owner=OWNERS["TFF"]) + STATION.format(owner=OWNERS["TJO"]).split("\n",1)[1]
        with self.assertRaisesRegex(ValueError, "mixed"):
            exports.classify(body.encode())
    def test_invalid_header_rejected(self):
        with self.assertRaisesRegex(ValueError, "cannot uniquely identify"):
            exports.classify(b"uid,quantity\n1,2\n")

if __name__ == "__main__":
    unittest.main()
