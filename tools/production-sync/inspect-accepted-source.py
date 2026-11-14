"""Select accepted upstream source before any optional Drive export access."""
import json, os, pathlib, re, subprocess, sys

def main():
    run = os.environ['ACCEPTED_RUN_ID']
    if not re.fullmatch(r'[0-9]+', run):
        raise ValueError('Invalid accepted run')
    output = pathlib.Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(['gh', 'run', 'download', run, '-R', os.environ['GITHUB_REPOSITORY'],
                             '-n', 'swc-audited-ledger', '-D', str(output)], capture_output=True)
    source = 'csv'
    if result.returncode == 0:
        manifest = output / 'swc-exports' / 'export-manifest.json'
        if manifest.is_file():
            source = json.loads(manifest.read_text()).get('source', 'csv')
    if source not in ('api', 'csv'):
        raise ValueError('Unknown accepted source')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
        stream.write('source=' + source + '\n')
    print('Upstream input source:', source)

if __name__ == '__main__':
    main()
