import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location("capture",Path(__file__).with_name("capture-overview-snapshot.py"))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class CaptureTests(unittest.TestCase):
 def test_bounded_snapshot_preserves_one_based_rows(self):
  orders={"orders":[{"system":"Eberon","row":3}]}
  response={"valueRanges":[{"values":[["Ship type"],["ship"],["ship"],["ship"]]},{"values":[["banner"],["Hub (5,10)"],["4,9","TIE/in Interceptor","48","Yes"]]}]}
  with patch.object(module,"get",return_value=response) as getter:
   out=module.capture("token","sheet",{"destinations":[]},orders)
  self.assertEqual(out["rowsBySystem"]["Eberon"][3][0],"4,9")
  self.assertEqual(out["rowsBySystem"]["Eberon"][3][3],"Yes")
  self.assertIn("valueRenderOption=FORMATTED_VALUE",getter.call_args.args[0])
 def test_incomplete_api_result_fails(self):
  with patch.object(module,"get",return_value={"valueRanges":[]}):
   with self.assertRaisesRegex(ValueError,"Incomplete"):module.capture("token","sheet",{},{"orders":[{"system":"Eberon"}]})
if __name__=="__main__":unittest.main()
