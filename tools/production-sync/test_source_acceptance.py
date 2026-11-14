import importlib.util, json, os, pathlib, sys, tempfile, unittest
from unittest.mock import patch

HERE=pathlib.Path(__file__).parent
def load(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

class SourceAcceptanceTests(unittest.TestCase):
    def test_sources_keep_separate_acceptance_histories(self):
        module=load('accept-export-batch')
        for source,filename in [('csv','accepted-batch.json'),('api','accepted-api-batch.json')]:
            with self.subTest(source=source),tempfile.TemporaryDirectory() as folder:
                base=pathlib.Path(folder)
                files=[{'owner':owner,'kind':kind,'id':owner+kind,'sha256':'fixture','rowCount':1} for owner in ['TFF','TJO'] for kind in ['Stations','Materials']]
                (base/'manifest.json').write_text(json.dumps({'source':source,'files':files}))
                (base/'write.json').write_text(json.dumps({'status':'verified'}))
                calls=[]
                def api(url,token,method='GET',payload=None):
                    calls.append((url,method,payload));return None if method=='GET' else {}
                with patch.dict(os.environ,{'GITHUB_REPOSITORY':'fixture/repo','GH_TOKEN':'fixture'}),patch.object(module,'api',side_effect=api),patch.object(sys,'argv',['test',str(base/'manifest.json'),str(base/'write.json'),str(base/'report.json')]):
                    module.main()
                self.assertEqual(len(calls),2)
                self.assertTrue(all(url.endswith(filename) for url,_,_ in calls))
                self.assertEqual(json.loads((base/'report.json').read_text())['source'],source)

    def test_unverified_write_cannot_accept_either_source(self):
        module=load('accept-export-batch')
        with tempfile.TemporaryDirectory() as folder:
            base=pathlib.Path(folder);(base/'manifest.json').write_text('{}');(base/'write.json').write_text('{"status":"dry_run"}')
            with patch.object(module,'api') as api,patch.object(sys,'argv',['test',str(base/'manifest.json'),str(base/'write.json'),str(base/'report.json')]):
                with self.assertRaises(ValueError):module.main()
            api.assert_not_called()

if __name__=='__main__':unittest.main()
