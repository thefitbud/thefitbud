"""DS5 legal frames + 27-android-rest. Run from docs/design/mockups/: python3 tools/ds5_legal.py
Writes html/<name>.html and renders png/<name>.png with headless Chrome."""
import re, subprocess, os, shutil
H = 'html/'
CHROME = shutil.which('google-chrome') or shutil.which('chromium')
def ic(d): return f'<svg class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>'
EXT = ic('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>')
SHIELD = ic('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>')
DOC = ic('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>')
CC = ic('<circle cx="12" cy="12" r="10"/><path d="M10 9.5a3 3 0 1 0 0 5"/><path d="M17 9.5a3 3 0 1 0 0 5"/>')
WARN = ic('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>')
BACK = ic('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>')
LOCK = ic('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>')
PH = "Placeholder, counsel's text goes here"

# --- real credit data (credits-and-licences.md, MEDIA_ATTRIBUTION.md, seed/library/ATTRIBUTION.md) ---
AUTHORS = [("Everkinetic (everkinetic.com)", "912", "CC BY-SA 4.0 / 3.0", "Everkinetic, Wikimedia Commons, wger"),
           ("CFCF", "4", "CC BY-SA 4.0", "Wikimedia Commons"),
           ("wger.de", "2", "CC BY-SA 3.0", "wger"),
           ("hans", "1", "CC BY-SA 4.0", "wger")]
IMAGES = [("Bench Press: Barbell", "Everkinetic (everkinetic.com)", "Everkinetic · github.com/everkinetic/data", "CC BY-SA 4.0"),
          ("Walking lunges 1.svg", "Everkinetic (everkinetic.com)", "Wikimedia Commons", "CC BY-SA 3.0"),
          ("Shoulder Press, Dumbbells", "Everkinetic (everkinetic.com)", "wger.de", "CC BY-SA 3.0"),
          ("Standing-calf-raises-1.svg", "CFCF", "Wikimedia Commons", "CC BY-SA 4.0"),
          ("Shoulder Press, on Machine", "wger.de", "wger.de", "CC BY-SA 3.0"),
          ("Barbell Step Back Lunge", "hans", "wger.de", "CC BY-SA 4.0")]
FOOD = [("Indian Nutrient Databank (INDB)", "Nutrient data: Indian Nutrient Databank (INDB), Vijayakumar et al. 2024, CC BY 4.0.", "CC BY 4.0"),
        ("USDA FoodData Central", "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov.", "Public domain / CC0 1.0")]

def ph_lines(n, w=(100, 96, 88, 72)):
    return ''.join(f'<i class="pl" style="width:{w[k % len(w)]}%"></i>' for k in range(n))

def privacy_body():
    s = [("1. Who we are", 3), ("2. What we collect", 4), ("3. What your coach can see", 3), ("4. How we use your data", 4), ("5. Who we share it with", 3)]
    out = ('<div class="del"><b>Deleting your account during the beta.</b> Email <a href="mailto:tech@thefitbud.com">tech@thefitbud.com</a> '
           'from the email or number on your account and ask us to delete it. There is no in-app delete button yet.</div>')
    out += ''.join(f'<h2>{h}</h2><p class="phc">{PH}.</p>{ph_lines(n)}' for h, n in s)
    out += '<h2>6. Deleting your account</h2><p class="phc">' + PH + ' (what is deleted, how long it takes, what we keep and why).</p>' + ph_lines(2)
    out += f'<h2>7. Contact</h2><p class="phc">{PH}.</p>{ph_lines(2)}'
    return out

def terms_body():
    s = [("1. Using FitBud", 4), ("2. Accounts", 3), ("3. Coaches and clients", 4), ("4. Health information", 3), ("5. Payments", 2), ("6. Ending your account", 3), ("7. Liability", 3), ("8. Changes to these terms", 2)]
    return ''.join(f'<h2>{h}</h2><p class="phc">{PH}.</p>{ph_lines(n)}' for h, n in s)

def credits_body(mobile=False):
    o = ('<h2>Exercise drawings</h2><p class="lead2">919 drawings for 460 exercises, all under Creative Commons BY-SA. '
         'Edited versions are shared under the same licence. Each drawing also has a credit line in the exercise info sheet.</p>')
    if mobile:
        o += '<div class="cards">' + ''.join(f'<div class="ac"><b>{a}</b><span>{n} drawings · {l}</span><span>{src}</span></div>' for a, n, l, src in AUTHORS) + '</div>'
    else:
        o += ('<table class="t"><thead><tr><th>Author</th><th>Drawings</th><th>Licence</th><th>Where from</th></tr></thead><tbody>'
              + ''.join(f'<tr><td><b>{a}</b></td><td>{n}</td><td><a href="#">{l}</a></td><td>{s}</td></tr>' for a, n, l, s in AUTHORS) + '</tbody></table>')
    o += '<h3>Every drawing</h3><div class="srch">' + ic('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>') + '<span>Search by exercise or author</span><em>919</em></div>'
    if mobile:
        o += '<div class="cards">' + ''.join(f'<div class="ac"><b>“{t}”</b><span>{a}</span><span>{s} · <a href="#">{l}</a></span></div>' for t, a, s, l in IMAGES[:4]) + '</div><p class="more">Showing 4 of 919 · Show more</p>'
    else:
        o += ('<table class="t"><thead><tr><th>Title</th><th>Author</th><th>Source</th><th>Licence</th></tr></thead><tbody>'
              + ''.join(f'<tr><td><b>“{t}”</b></td><td>{a}</td><td>{s}</td><td><a href="#">{l}</a></td></tr>' for t, a, s, l in IMAGES) + '</tbody></table><p class="more">Showing 6 of 919 · Show more</p>')
    o += '<h2>Food data</h2>'
    o += '<div class="cards">' + ''.join(f'<div class="ac"><b>{n}</b><span class="q">{c}</span><span>{l}</span></div>' for n, c, l in FOOD) + '</div>'
    o += ('<h2>Exercise text</h2><div class="cards"><div class="ac"><b>free-exercise-db (yuhonas)</b><span>Exercise names, steps, muscles, equipment</span><span>The Unlicense (public domain)</span></div></div>')
    return o

PAGES = {'privacy': ('Privacy policy', privacy_body), 'terms': ('Terms of use', terms_body), 'credits': ('Credits and licences', None)}

WEB_CSS = '''
body{background:var(--page-web)}
.top{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;background:#fff;border-bottom:1px solid var(--border)}
.top .lg{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;color:var(--navy);letter-spacing:-.02em}.top .lg img{width:28px}
.top a.bk{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--indigo)}.top a.bk svg.ic{width:16px;height:16px}
.lay{display:grid;grid-template-columns:240px 760px;gap:48px;justify-content:center;padding:40px 0 0;height:836px;overflow:hidden}
.lnav{display:flex;flex-direction:column;gap:4px}
.lnav .k{font-size:12px;font-weight:600;color:var(--ink-500);text-transform:uppercase;letter-spacing:.06em;margin:0 12px 8px}
.lnav a{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:10px;font-size:14px;font-weight:600;color:var(--ink-700)}
.lnav a svg.ic{width:18px;height:18px;color:var(--ink-500)}
.lnav a.on{background:var(--sel-bg);color:var(--sel)}.lnav a.on svg.ic{color:var(--sel)}
.lnav .hlp{margin:20px 12px 0;font-size:13px;line-height:18px;color:var(--ink-500)}.lnav .hlp a{display:inline;padding:0;height:auto;color:var(--indigo)}
.doc{background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:var(--e1);padding:36px 44px 40px}
.doc h1{font-size:30px;line-height:38px;font-weight:700;color:var(--navy);letter-spacing:-.02em}
.doc .upd{font-size:14px;color:var(--ink-500);margin-top:6px}
'''
SHARED_CSS = '''
.phb{display:flex;gap:10px;align-items:flex-start;margin-top:20px;padding:12px 14px;border-radius:12px;background:var(--attn-bg);border:1px dashed var(--attn);color:var(--attn);font-size:14px;line-height:20px;font-weight:600}
.phb svg.ic{width:18px;height:18px;flex:none;margin-top:1px}
.doc h2{font-size:18px;line-height:26px;font-weight:700;color:var(--navy);margin-top:24px}
.doc h3{font-size:15px;font-weight:700;color:var(--navy);margin-top:20px}
.doc .phc{font-size:14px;line-height:20px;color:var(--attn);font-style:italic;margin-top:4px}
.doc i.pl{display:block;height:10px;border-radius:5px;background:var(--ink-200);margin-top:9px}
.doc .lead2{font-size:15px;line-height:22px;color:var(--ink-700);margin-top:6px}
.doc .del{margin-top:14px;padding:14px 16px;border-radius:12px;background:var(--lavender-50);border:1px solid var(--sel-bg);font-size:15px;line-height:22px;color:var(--ink-700)}
.doc .del b{color:var(--navy)}.doc .del a{color:var(--indigo);font-weight:600}
.t{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
.t th{text-align:left;font-size:12px;font-weight:600;color:var(--ink-500);text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;border-bottom:1px solid var(--border)}
.t td{padding:10px;border-bottom:1px solid var(--border);color:var(--ink-700)}.t td b{color:var(--navy);font-weight:600}
.t a,.ac a{color:var(--indigo);font-weight:600}
.srch{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;margin-top:10px;border:1px solid var(--border-strong);border-radius:10px;font-size:14px;color:var(--ink-500)}
.srch svg.ic{width:16px;height:16px}.srch em{margin-left:auto;font-style:normal;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--neu-bg);color:var(--neu)}
.more{font-size:13px;color:var(--ink-500);margin-top:10px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.ac{border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:3px}
.ac b{font-size:15px;color:var(--navy);font-weight:700}.ac span{font-size:13px;line-height:18px;color:var(--ink-500)}.ac span.q{color:var(--ink-700)}
'''
def web_page(key):
    title, fn = PAGES[key]
    body = credits_body() if key == 'credits' else fn()
    nav = ''.join(f'<a class="{"on" if k == key else ""}" href="/{k}">{i}{PAGES[k][0]}</a>' for k, i in (('privacy', SHIELD), ('terms', DOC), ('credits', CC)))
    banner = '' if key == 'credits' else f'<div class="phb">{WARN}<span>{PH}. Layout only: the final text comes from <code>docs/legal/{key}.md</code>.</span></div>'
    upd = 'Built from the library data. Updated with each library release.' if key == 'credits' else 'Last updated: placeholder date'
    return f'''<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><title>FitBud · {title} (web)</title><link rel="stylesheet" href="tokens.css"><style>{WEB_CSS}{SHARED_CSS}</style></head><body>
<header class="top"><div class="lg"><img src="assets/mark.svg" alt="">FitBud</div><a class="bk" href="/signin">{BACK}Back to sign in</a></header>
<div class="lay"><nav class="lnav" aria-label="Legal"><div class="k">Legal</div>{nav}<p class="hlp">Questions? <a href="mailto:tech@thefitbud.com">tech@thefitbud.com</a></p></nav>
<main class="doc"><h1>{title}</h1><p class="upd">{upd}</p>{banner}{body}</main></div></body></html>'''

def signin_footer():
    t = open(H + '01-trainer-web-signin.html').read()
    foot = ('<div class="help">Trouble signing in? <a href="mailto:tech@thefitbud.com">Need help?</a>'
            '<nav class="lgl" aria-label="Legal"><a href="/privacy">Privacy</a><span>·</span><a href="/terms">Terms</a><span>·</span><a href="/credits">Credits and licences</a></nav></div>')
    t = re.sub(r'<div class="help">.*?</div>', foot, t, count=1, flags=re.S)
    t = t.replace('</style>', '.help .lgl{display:flex;justify-content:center;gap:8px;margin-top:10px;font-size:13px}.help .lgl a{color:var(--ink-500);font-weight:500;text-decoration:underline;text-underline-offset:2px}.help .lgl span{color:var(--ink-400)}\n</style>')
    return t.replace('<title>FitBud · Sign in</title>', '<title>FitBud · Sign in · legal footer (DS5)</title>')

# ---- iOS ----
SRC16 = open(H + '16-trainee-more-ios.html').read()
SB = re.search(r'<div class="sb" data-chrome>.*?</span></div>', SRC16, re.S).group(0)
SB = SB.replace('6:15', '9:41')
M_CSS = '''
.m2 .scroll{padding-top:54px}
.sv{position:absolute;top:54px;left:0;right:0;height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#F7F7F8;border-bottom:1px solid var(--border);z-index:3}
.sv .done{font-size:17px;font-weight:600;color:#0A62D0}.sv .url{display:flex;align-items:center;gap:5px;font-size:14px;color:var(--ink-700)}.sv .url svg.ic{width:12px;height:12px}
.sv .aa{width:40px;text-align:right;font-size:15px;color:#0A62D0;font-weight:600}
.pg{position:absolute;top:106px;bottom:0;left:0;right:0;overflow:hidden;background:#fff}
.pg .mt{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;border-bottom:1px solid var(--border)}
.pg .mt .lg{display:flex;align-items:center;gap:8px;font-weight:700;color:var(--navy);font-size:16px}.pg .mt .lg img{width:22px}
.pg .tabs{display:flex;gap:6px;padding:12px 18px 0}.pg .tabs a{height:32px;padding:0 12px;border-radius:999px;display:grid;place-items:center;font-size:13px;font-weight:600;color:var(--ink-700);border:1px solid var(--border)}
.pg .tabs a.on{background:var(--sel-bg);color:var(--sel);border-color:var(--sel-bg)}
.doc{padding:14px 18px 40px}.doc h1{font-size:26px;line-height:32px;font-weight:700;color:var(--navy);letter-spacing:-.02em}.doc .upd{font-size:13px;color:var(--ink-500);margin-top:4px}
.doc h2{font-size:17px;margin-top:20px}.cards{grid-template-columns:1fr}
.tbar{position:absolute;bottom:0;left:0;right:0;height:84px;background:#F7F7F8;border-top:1px solid var(--border);display:flex;justify-content:space-around;padding-top:12px;color:#0A62D0;z-index:3}
.tbar svg.ic{width:22px;height:22px}
'''
def ios_page(key):
    title, fn = PAGES[key]
    body = credits_body(True) if key == 'credits' else fn()
    tabs = ''.join(f'<a class="{"on" if k == key else ""}" href="/{k}">{n}</a>' for k, n in (('privacy', 'Privacy'), ('terms', 'Terms'), ('credits', 'Credits')))
    banner = '' if key == 'credits' else f'<div class="phb">{WARN}<span>{PH}.</span></div>'
    upd = 'Built from the library data.' if key == 'credits' else 'Last updated: placeholder date'
    share = ic('<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>')
    return f'''<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><title>FitBud · {title} (iOS, in-app browser)</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="m2.css"><style>{SHARED_CSS}{M_CSS}</style></head>
<body><div class="phone ios m m2" style="background:#F7F7F8">{SB}
<div class="sv"><span class="done">Done</span><span class="url">{LOCK}app.thefitbud.com/{key}</span><span class="aa">AA</span></div>
<div class="pg"><div class="mt"><div class="lg"><img src="assets/mark.svg" alt="">FitBud</div></div><div class="tabs">{tabs}</div>
<main class="doc"><h1>{title}</h1><p class="upd">{upd}</p>{banner}{body}</main></div>
<div class="tbar">{ic('<path d="m15 18-6-6 6-6"/>')}{ic('<path d="m9 18 6-6-6-6"/>')}{share}{ic('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>')}</div>
<div class="home-ind" data-chrome></div></div></body></html>'''

def more_legal():
    t = SRC16
    row = lambda tile, b, s: f'<a class="lrow" href="#"><span class="tile neu">{tile}</span><div class="tx"><b>{b}</b><span>{s}</span></div>{EXT.replace("class=\"ic\"", "class=\"ic chev\"")}</a>'
    grp = ('<div class="lgh">Legal</div><div class="c2 grp" style="padding:0">'
           + row(SHIELD, 'Privacy policy', 'Opens app.thefitbud.com/privacy')
           + row(DOC, 'Terms of use', 'Opens app.thefitbud.com/terms')
           + row(CC, 'Credits and licences', 'Exercise drawings and food data')
           + '</div>')
    anchor = '<div class="c2 grp" style="padding:0">\n    <a class="lrow" href="mailto:tech@thefitbud.com">'
    assert anchor in t
    t = t.replace(anchor, grp + anchor)
    t = t.replace('</style>', '.m2 .sb{background:#fff}\n.lgh{font-size:13px;font-weight:600;color:var(--ink-500);text-transform:uppercase;letter-spacing:.06em;margin:20px 8px 8px}\n.lgh + .c2{margin-top:0}\n</style>')
    t = t.replace('</body>', '<script>const s=document.querySelector(".scroll");s.style.overflow="hidden";s.scrollTop=s.scrollHeight;</script></body>')
    return t.replace('<title>FitBud · More (iOS)</title>', '<title>FitBud · More · Legal group (iOS, DS5)</title>')

def signin_ios():
    t = open(H + '06-trainee-signin-ios.html').read()
    t = t.replace('<div class="needhelp"><a href="mailto:tech@thefitbud.com">Need help?</a></div>',
                  '<div class="needhelp"><a href="mailto:tech@thefitbud.com">Need help?</a><div class="lgl"><a href="#">Privacy</a> · <a href="#">Terms</a></div></div>')
    t = t.replace('</style>', '.needhelp{bottom:30px}.needhelp .lgl{margin-top:8px;font-size:13px;color:var(--ink-400)}.needhelp .lgl a{color:var(--ink-500);font-weight:500;text-decoration:underline;text-underline-offset:2px}\n</style>', 1)
    return t

# ---- Android rest (based on 27-android-trainee-workout-notif.html, rest per 27c) ----
def android_rest():
    return '''<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><title>FitBud · Android workout notification · rest timer</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="and6.css"><style>
.ash{width:412px;height:915px}
.an .hd .ch{margin-left:auto;display:inline-flex;align-items:center;gap:4px;color:#E6E0FF;font-weight:600;font-variant-numeric:tabular-nums}
.an .rt{display:flex;align-items:baseline;gap:8px;margin-top:10px}.an .rt h4{margin:0}
.an .rt .cd{font-size:28px;font-weight:600;font-variant-numeric:tabular-nums;color:#fff}
.an .pb{height:4px;border-radius:2px;background:#3a3647;margin-top:12px;overflow:hidden}.an .pb i{display:block;height:100%;width:36%;background:#B7A9F5;border-radius:2px}
.an .nx{margin-top:12px;display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:16px;background:#3a3647;font-size:14px;color:#d6d2e6}
.an .nx b{color:#fff;font-size:16px;font-weight:600}.an .nx b i{font-style:normal;font-size:12px;color:#d6d2e6;margin:0 2px}
</style></head><body><div class="ash"><div class="sb"><span>7:26</span><span>5G ▮</span></div><div class="qs"><div class="clk">7:26</div><div class="dt">Mon, 19 Oct</div><div class="tiles"><i></i><i></i><i></i><i></i></div></div>
<div class="an"><div class="hd"><img src="assets/app-icon.png" alt="FitBud"><span>FitBud · Lower body B</span><span class="ch" aria-label="Rest ends in 58 seconds">⏱ 0:58</span></div>
<div class="rt"><h4>Rest</h4><span class="cd">0:58</span></div>
<p>Set 2 logged · 22.5 kg × 10</p>
<div class="pb" role="progressbar" aria-label="Rest time left"><i></i></div>
<div class="nx"><span>Next · Romanian deadlift · Set 3 of 3</span><b>22.5<i>kg</i>× 10</b></div>
<div class="acts"><a class="p" href="#">Skip rest</a><a href="#">Open</a></div></div>
<div class="an dim"><div class="hd"><img src="assets/app-icon.png" alt="FitBud"><span>FitBud · 4 min ago</span></div><h4>Set 1 logged · 20 kg × 10</h4></div>
<div class="nav"></div></div></body></html>'''

FRAMES = [
    ('ds5-web-signin-footer', signin_footer, (1440, 900), 2),
    ('ds5-web-privacy', lambda: web_page('privacy'), (1440, 900), 2),
    ('ds5-web-terms', lambda: web_page('terms'), (1440, 900), 2),
    ('ds5-web-credits', lambda: web_page('credits'), (1440, 900), 2),
    ('ds5-ios-signin-footer', signin_ios, (393, 852), 3),
    ('ds5-ios-more-legal', more_legal, (393, 852), 3),
    ('ds5-ios-privacy', lambda: ios_page('privacy'), (393, 852), 3),
    ('ds5-ios-terms', lambda: ios_page('terms'), (393, 852), 3),
    ('ds5-ios-credits', lambda: ios_page('credits'), (393, 852), 3),
    ('27-android-rest', android_rest, (412, 915), 1080 / 412),
]
if __name__ == '__main__':
    args = []
    for name, fn, (w, h), dpr in FRAMES:
        open(H + name + '.html', 'w').write(fn())
        args.append(f'{name}:{w}:{h}:{dpr}')
    subprocess.run(['node', 'tools/ds5_render.mjs', *args], check=True)
