import json,os,subprocess,tempfile,unittest,pathlib
SCRIPT=pathlib.Path(__file__).with_name('dispatch-accepted-overview.sh')
class DispatchTests(unittest.TestCase):
 def invoke(self,acceptance,write):
  with tempfile.TemporaryDirectory() as folder:
   a=pathlib.Path(folder)/'acceptance.json';w=pathlib.Path(folder)/'write.json'
   a.write_text(json.dumps(acceptance));w.write_text(json.dumps(write))
   env={**os.environ,'GITHUB_REPOSITORY':'example/repo','GITHUB_RUN_ID':'12345','GH_TOKEN':'test','ACCEPTANCE_REPORT':str(a),'HAS_WRITE_REPORT':str(w),'PATH':'/usr/bin:/bin'}
   return subprocess.run(['bash',str(SCRIPT)],env=env,capture_output=True,text=True)
 def test_rejects_unaccepted_batch(self):
  r=self.invoke({'status':'pending','acceptedFiles':['a','b','c','d']},{'status':'verified'})
  self.assertNotEqual(r.returncode,0)
  self.assertIn('not accepted',r.stderr)
 def test_rejects_unverified_has(self):
  r=self.invoke({'status':'accepted','acceptedFiles':['a','b','c','d']},{'status':'dry_run'})
  self.assertNotEqual(r.returncode,0)
  self.assertIn('not verified',r.stderr)
 def test_rejects_missing_export(self):
  r=self.invoke({'status':'accepted','acceptedFiles':['a','b','c']},{'status':'verified'})
  self.assertNotEqual(r.returncode,0)
  self.assertIn('four accepted',r.stderr)
if __name__=='__main__':unittest.main()
