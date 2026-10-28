import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("publisher",Path(__file__).with_name("overview-publish-preview.py"))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class PreviewTests(unittest.TestCase):
 def sample(self):
  snap={"schemaVersion":1,"mode":"read_only","statistics":{"liveOrders":1},"orders":[{"id":"5:12345","system":"Eberon","status":"building","ownerFaction":"TJO","ownerFactionId":"1838"}],
   "coverageAudit":{"systems":[{"system":"Eberon"}],"totals":{"classifiedOrders":1,"uncoveredExportShipyardsInTrackedSystems":0,"exportedShipyardsInTrackedSystems":1}},
   "summary":{"rows":[{"system":"Eberon","building":1,"ready_now":0,"transfer":0,"blocked":0,"unassigned":0,"total":1}],"totals":{"total":1}}}
  audit={"status":"matched","statistics":{"differences":0,"validationErrors":0,"overviewOrders":1}}
  return snap,audit
 def test_preview_is_read_only(self):
  p=module.preview(*self.sample())
  self.assertFalse(p["writeAuthorized"])
  self.assertEqual(p["values"][-1],["TOTAL",1,0,0,0,0,1])
  self.assertEqual(p["stationIdsBySystemStatus"][0][0],["12345"])
  self.assertEqual(p["stationIdsBySystemStatusFaction"][0][0],{"TJO":["12345"],"TFF":[]})
 def test_uncovered_shipyard_fails(self):
  s,a=self.sample();s["coverageAudit"]["totals"]["uncoveredExportShipyardsInTrackedSystems"]=1
  with self.assertRaisesRegex(ValueError,"Uncovered"):module.preview(s,a)
 def test_shadow_mismatch_fails(self):
  s,a=self.sample();a["statistics"]["differences"]=1
  with self.assertRaisesRegex(ValueError,"Shadow"):module.preview(s,a)
if __name__=="__main__":unittest.main()
