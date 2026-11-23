"""Build an allowlisted Pages artifact; never copy private files or backups."""
from pathlib import Path
import hashlib, shutil
root=Path(__file__).resolve().parents[1]
files=['index.html','app.js','heating-board.js','heating-views.js','storage.js','insights.js','engo.js','temperatures.js','temperature-view.js','research.js','memory.js','memory-view.js','review.js','review-view.js','setti.js','heads.js','dehumidifiers.js','ha-sync.js','gas-sync.js','boiler-sync.js','sw.js','manifest.webmanifest','.nojekyll','icons/icon192.png','icons/icon512.png']
out=root/'dist'
if out.exists(): shutil.rmtree(out)
out.mkdir()
digest=hashlib.sha256(b''.join((root/'public'/f).read_bytes() for f in files)).hexdigest()[:16]
for name in files:
    target=out/name
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(root/'public'/name,target)
p=out/'sw.js'
p.write_text(p.read_text().replace("'development-1.8.2'",repr(digest)))
print('Prepared public release '+digest)
