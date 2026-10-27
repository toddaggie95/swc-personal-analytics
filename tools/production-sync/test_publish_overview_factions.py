import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("faction_publisher",Path(__file__).with_name("publish-overview-factions.py"))
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class FactionPublisherTests(unittest.TestCase):
 def sample(self):
  rows=[["System","Running","Ready Now","Ready w/ Material Move","Blocked","Unassigned","Total"]]
  groups=[]
  for i in range(20):
   row=["System%02d"%i,0,0,0,0,0,0]
   g=[{"TJO":[],"TFF":[]} for _ in range(5)]
   if i==0:
    row[5]=4;row[6]=4
    g[4]={"TJO":["60202","60226"],"TFF":["17607","17614"]}
   rows.append(row);groups.append(g)
  rows.append(["TOTAL",0,0,0,0,4,4])
  return {"mode":"dry_run","writeAuthorized":False,"targetSheet":"Production Overview",
          "range":"A5:G26","values":rows,"classifiedOrders":4,
          "stationIdsBySystemStatusFaction":groups}
 def test_chamble_mixed_factions(self):
  rows,merges,top=mod.build(self.sample())
  self.assertEqual(len(rows),42)
  self.assertEqual(len(merges),20*7+5)
  self.assertIn("InvID=1838",rows[1][9]["userEnteredValue"]["formulaValue"])
  self.assertIn("60202",rows[1][9]["userEnteredValue"]["formulaValue"])
  self.assertIn("InvID=1174",rows[2][9]["userEnteredValue"]["formulaValue"])
  self.assertIn("17607",rows[2][9]["userEnteredValue"]["formulaValue"])
  self.assertEqual(rows[1][10]["userEnteredValue"]["numberValue"],4)
 def test_faction_count_mismatch_fails(self):
  p=self.sample();p["stationIdsBySystemStatusFaction"][0][4]["TFF"].pop()
  with self.assertRaisesRegex(ValueError,"Faction counts"):mod.build(p)
 def test_unknown_owner_fails(self):
  p=self.sample();p["stationIdsBySystemStatusFaction"][0][4]["OTHER"]=[]
  with self.assertRaisesRegex(ValueError,"Missing faction"):mod.build(p)
if __name__=="__main__":unittest.main()
