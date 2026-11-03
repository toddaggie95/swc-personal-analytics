import csv, json, pathlib, subprocess, sys, tempfile, unittest

SCRIPT = pathlib.Path(__file__).with_name("compare-kashyyyk.py")

class ParitySmokeTest(unittest.TestCase):
    def test_empty_valid_snapshots(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            web, api, out = (root / x for x in ("web", "api", "out"))
            web.mkdir(); api.mkdir()
            fields = ["uid","name","type_name","owner_uid","system_uid","sysX","sysY","quantity","container_uid","container_type_name","surfX","surfY","groundX","groundY","tooled-to","productionStatus","productionQuantity"]
            for faction in ("tff","tjo"):
                for kind in ("materials","stations"):
                    with (web / f"{faction}-{kind}.csv").open("w", newline="") as f:
                        csv.DictWriter(f, fieldnames=fields).writeheader()
                    doc = {"summary":{"locationFilter":{"uid":"9:104"}},kind:[]}
                    (api / f"{faction}__{kind}__system-kashyyyk__test.json").write_text(json.dumps(doc))
            result = subprocess.run([sys.executable,str(SCRIPT),"--web-dir",str(web),"--api-dir",str(api),"--out-dir",str(out)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(json.loads((out/"summary.json").read_text())["discrepancies"],0)

if __name__ == "__main__":
    unittest.main()
