"""Stage the isolated live-readout preview from the allowlisted application build."""
from hashlib import sha256
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
out = Path(sys.argv[1])
shutil.copytree(dist, out, dirs_exist_ok=True)
client = (root / 'scripts/heating-preview-client.js').read_bytes()
(out / 'review-fixture.js').write_bytes(client)
page = out / 'index.html'
html = page.read_text()
html = html.replace(html[html.index('connect-src '):html.index('; object-src')], "connect-src 'self'")
html = html.replace('<script src="./app.js"></script>',
                    '<script src="./review-fixture.js"></script>\n<script src="./app.js"></script>')
page.write_text(html)
sw = out / 'sw.js'
cache = sw.read_text()
fingerprint = sha256(client + page.read_bytes()).hexdigest()[:8]
marker = cache.split("const VERSION='",1)[1].split("'",1)[0]
cache = cache.replace("const VERSION='"+marker+"'", "const VERSION='"+marker+"-preview-"+fingerprint+"'")
cache = cache.replace("const PREFIX='moje-ogrzewanie:", "const PREFIX='moje-ogrzewanie-test:")
cache = cache.replace("'./heating-views.js'", "'./heating-views.js','./review-fixture.js'")
sw.write_text(cache)
