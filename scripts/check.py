from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
public=root/'public'
allowed={'index.html','app.js','storage.js','sw.js','manifest.webmanifest','.nojekyll','icons/icon192.png','icons/icon512.png'}
actual={str(p.relative_to(public)) for p in public.rglob('*') if p.is_file()}
assert actual==allowed|{'icons/.gitkeep'}, 'Unexpected public files'
text='\n'.join(p.read_text() for p in public.iterdir() if p.is_file())
assert not re.search(r'\b\d{1,3}/\d{1,3}\b',text), 'Review possible address'
assert 'data:image/svg+xml;base64,' not in text, 'Embedded map is forbidden'
assert not re.search(r'\barea:|\d+,\d{2} m²|ogrzewanie_instalacja',text), 'Private geometry detected'
html=(public/'index.html').read_text()
assert '<script>' not in html, 'Inline scripts blocked by CSP'
for path in re.findall(r'(?:src|href)="\./([^"#]+)"',html):assert (public/path).is_file(),path
manifest=json.loads((public/'manifest.webmanifest').read_text())
assert manifest['start_url']=='./index.html' and manifest['scope']=='./'
for icon in manifest['icons']:assert (public/icon['src']).is_file()
assert 'localStorage.clear' not in text and 'skipWaiting()' not in text
print('Privacy structure, assets, manifest and data/update safeguards: OK')
