from pathlib import Path
p = Path(__file__).parent
(p/'plugin.js').write_text('\n'.join((p/'src'/f).read_text() for f in ['core.js','lampa.js']))
print('plugin.js built')
