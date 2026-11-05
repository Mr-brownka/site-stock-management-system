# Builds the static Ostock website. Run from website/: python3 build.py . Shared nav, footer and icons live here once.
import pathlib, sys
OUT = pathlib.Path(sys.argv[1])

ICONS = {
 'box': '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
 'cart': '<path d="M3 4h2l2.5 11h11L21 7H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
 'book': '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5M9 7h6M9 11h6"/>',
 'wifi': '<path d="M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19" r="1"/>',
 'link': '<path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
 'phone': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
 'arrow': '<path d="M5 12h14M13 6l6 6-6 6"/>',
 'crane': '<path d="M4 21V5h12M4 5l6-2M16 5v4M16 9l-2 3h4zM8 21h8M4 9h4"/>',
 'truck': '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
 'clip': '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
 'back': '<path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
 'swap': '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
 'count': '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8l1.5 1.5L12 7M8 14l1.5 1.5L12 13M14 8h2M14 14h2"/>',
 'chart': '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
 'cal': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 'bell': '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
 'finger': '<path d="M12 11v4M8.5 8.5A5 5 0 0117 12v2M7 12a5 5 0 01.3-1.7M7 15v-3M17 17v-1M10 21c1-2 2-4 2-6M14 20c.7-1.3 1.2-2.6 1.5-4"/><path d="M5 6.5A9 9 0 0121 12v2"/>',
 'hist': '<path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3"/><path d="M3 4v4h4M12 7v5l3 2"/>',
 'chat': '<path d="M4 20l1.5-4A8 8 0 1112 20a8 8 0 01-3.8-1z"/><path d="M9 10h6M9 13h4"/>',
 'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 'menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
 'pin': '<path d="M12 21s7-6.2 7-12a7 7 0 00-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
 'shield': '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
 'grid': '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><path d="M17.25 14v6.5M14 17.25h6.5"/>',
 'plan': '<path d="M4 5h9M4 10h14M4 15h7M4 20h11"/><circle cx="18" cy="5" r="1.6"/><circle cx="14" cy="15" r="1.6"/>',
 'zoho': '<path d="M4 7h16v10H4z"/><path d="M8 11h8M8 14h5"/>',
 'download': '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
}
def ic(n, cls='i'): return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{ICONS[n]}</svg>'

LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 10l11-5 11 5v12l-11 5-11-5z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M5 10l11 5 11-5M16 15v12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="25" cy="24" r="5.2" fill="#3BA7F2" stroke="var(--bg)" stroke-width="1.6"/><path d="M25 26.5v-5M22.8 23.6l2.2-2.2 2.2 2.2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

NAV = [('products.html', 'Products'), ('news.html', 'Announcements'), ('blog.html', 'Blog'), ('about.html', 'About')]

def page(fname, title, desc, body, event=False):
    links = ''.join(f'<a href="{h}"{" aria-current=\"page\"" if h == fname else ""}>{t}</a>' for h, t in NAV)
    ev = f'''<div class="event"><div class="wrap"><span class="tag">New</span><span>The phone app now works with no signal.</span><a href="news.html#no-signal">Read more</a></div></div>''' if event else ''
    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#0B3D91">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
{ev}
<header class="nav" id="nav"><div class="wrap">
  <a class="logo" href="index.html" aria-label="Ostock home">{LOGO}Ostock</a>
  <nav class="links" id="links" aria-label="Main">{links}</nav>
  <div class="end"><a class="btn line sm" href="https://site-stock-management-system.vercel.app">Sign in</a><a class="btn pri sm" href="contact.html">Book a demo</a>
  <button class="menuBtn" id="menuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="links">{ic('menu')}</button></div>
</div></header>
<main id="main">
{body}
</main>
<footer><div class="wrap">
  <div class="fgrid">
    <div><a class="logo" href="index.html">{LOGO}Ostock</a><p>Run your projects on Ostock. Software for construction companies, built on real sites in Nairobi.</p></div>
    <div><h4>Products</h4><a href="products.html">Inventory</a><a href="products.html#projects">Projects · soon</a><a href="products.html#books">Books · soon</a><a href="products.html#all">All in one</a></div>
    <div><h4>Company</h4><a href="about.html">About</a><a href="news.html">Announcements</a><a href="blog.html">Blog</a></div>
    <div><h4>Get started</h4><a href="contact.html">Book a demo</a><a href="https://site-stock-management-system.vercel.app">Sign in</a></div>
  </div>
  <div class="fbot"><span>© 2026 Ostock · Nairobi, Kenya</span><span>ostock.co.ke</span></div>
</div></footer>
<script src="site.js"></script>
</body>
</html>
'''
    (OUT / fname).write_text(html)

MOCK = '''<div class="mock" aria-hidden="true">
  <div class="kp"><div><small>In store</small><b>164</b></div><div><small>Used this week</small><b>11</b></div><div><small>Coming in</small><b>3</b></div></div>
  <div class="bars"><i style="height:40%"></i><i style="height:62%"></i><i style="height:35%"></i><i class="hi" style="height:92%"></i><i style="height:55%"></i><i style="height:24%"></i></div>
  <div class="tbl"><div class="tr"><span>Item</span><span>In</span><span>Out</span></div><div class="tr"><span>Cement 42.5N</span><span>300</span><span>140</span></div><div class="tr"><span>Y12 bars</span><span>200</span><span>60</span></div><div class="tr"><span>River sand</span><span>3</span><span>2</span></div></div>
</div>'''

SWASH = '<svg viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true"><path d="M4 20 C 70 8, 150 6, 296 14"/></svg>'

PRICE = 'KES 22,000'
PRODS = [('box', 'Inventory', 'Track your purchases and stock', 'products.html#inventory', 'live', 'Live'),
         ('plan', 'Projects', 'Track your project progress', 'products.html#projects', 'soon', 'Soon'),
         ('book', 'Books', 'Manage your money', 'products.html#books', 'soon money', 'Soon'),
         ('grid', 'All in one', 'Everything in one app, plus more', 'products.html#all', 'all', PRICE)]
apps = ''.join(f'<a class="pb {c}" href="{h}"><span class="ico">{ic(i)}</span><span class="tx"><b>{t}</b><span>{d}</span></span><span class="st">{st}</span></a>' for i, t, d, h, c, st in PRODS)

ANNS = [
 ('no-signal', '5 Nov 2026', 'The phone app works with no signal', 'Entries wait safely on the phone and send themselves when the network comes back. A small badge shows what is still waiting.', ['Inventory']),
 ('links', '5 Nov 2026', 'Personal links: no passwords to remember', 'Each person gets their own private link from the admin. Open it once and you are in. Fingerprint or Face ID works too.', ['Inventory']),
 ('install', '5 Nov 2026', 'Install Ostock on your phone', 'Add Ostock to the home screen and get a reminder before the register closes, an alert when stock runs low, and a note when a Zoho delivery arrives.', ['Inventory']),
 ('calendar', '4 Nov 2026', 'Deliveries in your calendar', 'Every expected delivery shows in Google, iPhone or Outlook calendars, and stays up to date by itself.', ['Inventory']),
 ('history', '4 Nov 2026', 'See who changed what', 'Every entry now keeps its full history: who made it, who changed it, and when.', ['Inventory']),
 ('zoho', '21 Oct 2026', 'Ostock connects to Zoho Books', 'Goods received in Zoho Books show in the site store by themselves. No double entry.', ['Inventory', 'Zoho Books']),
]
def ann(a, full=False):
    k, d, t, s, tags = a
    tg = ''.join(f'<span class="chip soon">{x}</span>' for x in tags) if full else ''
    return f'<div class="ann" id="{k}"><time>{d}</time><div><b>{t}</b><span>{s}</span>{f"<div class=tags>{tg}</div>" if tg else ""}</div></div>'

POSTS = [
 ('crane', '', 'Guide', 'Why site stock goes missing, and how a daily check-in stops it'),
 ('count', 'b', 'How-to', 'Run your first stock take in one afternoon'),
 ('zoho', '', 'Guide', 'Zoho Books and the site store: ending double entry'),
 ('wifi', 'b', 'Field notes', 'Building an app for sites with no signal'),
]
def post(p):
    i, c, k, t = p
    return f'<div class="post"><span class="img {c}">{ic(i)}</span><span><small>{k}</small><b>{t}</b><span class="meta">Coming soon <span class="draft">Draft title</span></span></span></div>'

SUITE = f'''<div class="suite rv">
    <article class="pc feat" id="inventory"><span class="ico">{ic('box')}</span><span class="chip live">Live</span><h3>Ostock Inventory</h3>
      <p>Track your purchases and stock. Live balances for every site store; the storekeeper enters the day and the numbers add up by themselves.</p>
      {MOCK}
      <a class="more" href="products.html#inventory-detail">See Inventory {ic('arrow')}</a></article>
    <article class="pc" id="projects"><span class="ico">{ic('plan')}</span><span class="chip soon">Coming soon</span><h3>Ostock Projects</h3>
      <p>Track your project progress, from the programme to what was done on site today.</p>
      <ul><li>Progress per floor and activity</li><li>Materials used against the plan</li><li>One view for the whole team</li></ul>
      <a class="more" href="contact.html?about=projects">Get notified {ic('arrow')}</a></article>
    <article class="pc money" id="books"><span class="ico">{ic('book')}</span><span class="chip soon">Coming soon</span><h3>Ostock Books</h3>
      <p>Manage your money. Accounts for construction companies, fed by the stock and purchases you already record.</p>
      <ul><li>Costs per project and per activity</li><li>Built for how sites really spend</li><li>Works alongside Zoho Books</li></ul>
      <a class="more" href="contact.html?about=books">Get notified {ic('arrow')}</a></article>
  </div>
  <div class="allin rv" id="all">
    <span class="ico">{ic('grid')}</span>
    <div><span class="kick">All in one</span><h3>Everything in one app, plus more.</h3><p>Inventory, Projects and Books together, with every new tool as it comes. One login, one price.</p></div>
    <div class="pr"><b>{PRICE}</b><span>per site, per month</span><a class="btn pri" href="contact.html?about=all">Book a free demo</a></div>
  </div>'''

# ---------------- Home ----------------
home = f'''
<div class="wrap">
  <div class="hero">
    <h1>Run your projects <span class="mark">on Ostock.</span></h1>
    <p class="lede">Simple software for construction companies. Start with live stock for every site store, entered on the phone in minutes a day.</p>
    <div class="ctas"><a class="btn pri" href="contact.html">Book a free demo {ic('arrow')}</a><a class="btn sec" href="products.html">See products</a></div>
    <p class="price"><span>All in one: <b>{PRICE}</b> per site, per month</span></p>
    <div class="apps">{apps}</div>
  </div>
</div>

<section><div class="wrap">
  <div class="head rv"><div><span class="kick">The suite</span><h2 class="h2">One home for the whole project.</h2><p class="sub">Start with Inventory today. Projects and Books join the same login, the same items and the same sites.</p></div></div>
  {SUITE}
</div></section>

<section style="padding-top:0"><div class="wrap">
  <div class="head rv"><div><span class="kick">How it works</span><h2 class="h2">Live in a day. Used every day.</h2></div></div>
  <div class="how rv">
    <div class="step"><span class="n">1</span><b>Connect Zoho Books</b><span>Your items and deliveries come in by themselves. Nothing typed twice.</span></div>
    <div class="step"><span class="n">2</span><b>Enter the day on the phone</b><span>What was issued, returned and moved. A few minutes before the store closes, even with no signal.</span></div>
    <div class="step"><span class="n">3</span><b>See every site, live</b><span>Balances, use per activity and what is running low, for every store, from anywhere.</span></div>
  </div>
</div></section>

<section style="padding-top:0"><div class="wrap">
  <div class="band rv">
    <div><span class="kick">Built on real sites</span><h2>Made with storekeepers, not for a demo.</h2><p>Ostock was built in Nairobi alongside working site stores. Every screen was tried by the people who use it at the end of a long day.</p></div>
    <div class="ctas"><a class="btn pri" href="contact.html">Book a free demo</a><a class="btn line" href="about.html">Our story</a></div>
  </div>
</div></section>

<section style="padding-top:0"><div class="wrap feed">
  <div class="rv"><div class="head" style="margin-bottom:12px"><div><span class="kick">Announcements</span><h2 class="h2" style="font-size:32px">What's new</h2></div><a class="btn line sm" href="news.html">All news</a></div>
    {''.join(ann(a) for a in ANNS[:3])}</div>
  <div class="rv"><div class="head" style="margin-bottom:20px"><div><span class="kick">Blog</span><h2 class="h2" style="font-size:32px">From the site</h2></div><a class="btn line sm" href="blog.html">The blog</a></div>
    <div class="posts">{''.join(post(p) for p in POSTS[:2])}</div></div>
</div></section>
'''
page('index.html', 'Ostock · Run your projects on Ostock', 'Simple software for construction companies. Inventory today; Projects and Books next.', home)

# ---------------- Inventory ----------------
FEATS = [
 ('truck', 'Deliveries from Zoho Books', 'Goods received in Zoho show in the store by themselves, with what is still coming in.'),
 ('clip', 'The issue register you know', 'Looks like the paper card your storekeepers already fill. Item, quantity, who took it, for which activity.'),
 ('back', 'Returns and transfers', 'Material back to the store or moved between projects, in two taps.'),
 ('count', 'Stock takes', 'Print a count sheet, count, upload. Differences are shown and approved before they count.'),
 ('chart', 'Reports and Excel', 'Stock on hand, use by activity, item ledger, low stock and more. Download or print any of them.'),
 ('wifi', 'Works with no signal', 'Entries wait on the phone and send themselves when the network is back.'),
 ('bell', 'Reminders and alerts', 'A nudge before the register closes, a note when stock runs low or a delivery arrives.'),
 ('finger', 'No passwords', 'A personal link for each person, plus fingerprint or Face ID.'),
 ('hist', 'Who changed what', 'Every entry keeps its full history, so nothing changes quietly.'),
]
feats = ''.join(f'<div class="ft">{ic(i)}<b>{t}</b><span>{s}</span></div>' for i, t, s in FEATS)
FAQ = [
 ('Do we have to stop using Zoho Books?', 'No. Ostock reads your items and goods received from Zoho Books. It never changes anything in Zoho.'),
 ('What phones does it work on?', 'Any modern Android phone or iPhone, through the browser. You can add it to the home screen like an app. It is light on data.'),
 ('What if the site has no network?', 'Keep working. Entries are saved on the phone and sent when the signal comes back.'),
 ('How long does it take to start a new site?', 'About a day. Connect Zoho, upload the first count from Excel, and the storekeeper starts that evening.'),
 ('Who can see what?', 'Storekeepers enter their own store. Managers and procurement can be given view-only access to the sites they need.'),
]
faq = ''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in FAQ)
inv = f'''
<div class="wrap phead">
  <a class="crumb" href="index.html">{ic('arrow')}Home</a>
  <span class="kick">Products</span>
  <h1 style="margin-top:12px">Built for <span class="mark">construction.</span></h1>
  <p class="lede">Pick the tool you need today, or take all of them in one app.</p>
</div>
<section style="padding-top:0"><div class="wrap">{SUITE}</div></section>
<div class="wrap phead" id="inventory-detail" style="padding-top:0">
  <div><span class="chip live">Live</span></div>
  <h2 class="h2" style="margin-top:14px">Ostock Inventory: every site store, live.</h2>
  <p class="lede">True stock balances for every site, entered by the storekeeper on the phone and joined to Zoho Books.</p>
  <div class="ctas" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:26px"><a class="btn pri" href="contact.html">Book a free demo {ic('arrow')}</a><a class="btn sec" href="https://site-stock-management-system.vercel.app">Sign in</a></div>
</div>
<section style="padding-top:12px"><div class="wrap shots rv">
  <div class="shotCard" style="background:var(--navy);border-color:var(--navy);color:#fff"><span class="kick" style="color:var(--mint)">On the laptop</span><h2 style="font-size:28px">Balances, use and deliveries for every site.</h2>{MOCK}</div>
  <div class="shotCard"><span class="kick">On the phone</span>
    <div class="phone" aria-hidden="true"><div class="scr">
      <div class="top"><span>Today</span><span style="color:#0B3D91">Site A</span></div>
      <div class="row"><span>Cement 42.5N</span><b>160 bags</b></div>
      <div class="row"><span>Y12 bars</span><b>140 pcs</b></div>
      <div class="row"><span>River sand</span><span class="warn">▲ Low</span></div>
      <div class="row"><span>Waiting to send</span><b>2</b></div>
      <div class="btnp">Submit the day</div>
    </div></div></div>
</div></section>
<section style="padding-top:0"><div class="wrap">
  <div class="head rv"><div><span class="kick">What's inside</span><h2 class="h2">Everything the store does in a day.</h2></div></div>
  <div class="feats rv">{feats}</div>
</div></section>
<section style="padding-top:0"><div class="wrap">
  <div class="head rv"><div><span class="kick">Questions</span><h2 class="h2">Good to know</h2></div></div>
  <div class="faq rv">{faq}</div>
</div></section>
<section style="padding-top:0"><div class="wrap"><div class="band rv">
  <div><span class="kick">Pricing</span><h2>All in one: {PRICE} per site, per month</h2><p>Inventory today, Projects and Books as they arrive, plus the phone app, Zoho Books connection, reports and support. Try it on one site first.</p></div>
  <div class="ctas"><a class="btn pri" href="contact.html">Book a free demo</a></div>
</div></div></section>
'''
page('products.html', 'Products · Ostock', 'Ostock Inventory, Projects, Books, and All in one: software built for construction companies.', inv)

# ---------------- News ----------------
news = f'''
<div class="wrap phead"><span class="kick">Announcements</span><h1 style="margin-top:12px">What's new in Ostock</h1><p class="lede">New features and changes, newest first.</p></div>
<div class="wrap"><div style="max-width:820px">{''.join(ann(a, True) for a in ANNS)}</div></div>
'''
page('news.html', 'Announcements · Ostock', 'New features and changes in Ostock, newest first.', news)

# ---------------- Blog ----------------
blog = f'''
<div class="wrap phead"><span class="kick">Blog</span><h1 style="margin-top:12px">From the site</h1><p class="lede">Guides and field notes on running site stores, buying materials and keeping projects on budget. First posts coming soon.</p></div>
<div class="wrap"><div class="posts" style="max-width:820px">{''.join(post(p) for p in POSTS)}</div></div>
'''
page('blog.html', 'Blog · Ostock', 'Guides and field notes on running construction site stores.', blog)

# ---------------- About ----------------
about = f'''
<div class="wrap phead"><span class="kick">About</span><h1 style="margin-top:12px">Software for the people who <span class="mark">build.</span></h1>
<p class="lede">Ostock started on a construction site in Nairobi, with one problem: nobody knew what was really in the store. We built the answer with the storekeepers who live with it every day, and we are growing it into a full suite for construction companies.</p></div>
<section style="padding-top:12px"><div class="wrap feats rv">
  <div class="ft">{ic('phone')}<b>Simple first</b><span>If a storekeeper can't use it at 6pm after a long day, it isn't done.</span></div>
  <div class="ft">{ic('shield')}<b>Honest numbers</b><span>Every change is kept with who made it. Balances you can trust.</span></div>
  <div class="ft">{ic('crane')}<b>Construction only</b><span>We build for contractors and developers, and nothing else.</span></div>
</div></section>
<section id="roadmap" style="padding-top:0"><div class="wrap">
  <div class="head rv"><div><span class="kick">Roadmap</span><h2 class="h2">Where we're going</h2></div></div>
  <div class="road rv">
    <div class="rm done"><span class="dot"></span><div><small>Live</small><b>Ostock Inventory</b><span>Live site stock, the phone app, Zoho Books, reports.</span></div></div>
    <div class="rm now"><span class="dot"></span><div><small>Coming soon</small><b>Ostock Projects</b><span>Track your project progress.</span></div></div>
    <div class="rm now"><span class="dot"></span><div><small>Coming soon</small><b>Ostock Books</b><span>Manage your money.</span></div></div>
    <div class="rm"><span class="dot"></span><div><small>{PRICE} per site, per month</small><b>All in one</b><span>Everything in one app, plus more.</span></div></div>
  </div>
</div></section>
'''
page('about.html', 'About · Ostock', 'Ostock builds simple software for construction companies, starting with live site stock.', about)

# ---------------- Contact ----------------
contact = f'''
<div class="wrap phead"><span class="kick">Book a demo</span><h1 style="margin-top:12px">See Ostock on your own site.</h1><p class="lede">Tell us a little about your company. We'll show you Ostock with your own items, on a phone and a laptop.</p></div>
<div class="wrap contact">
  <div class="ways">
    <div class="way"><span class="ico">{ic('chat')}</span><div><b>WhatsApp</b><span><span class="ph">[WhatsApp number]</span></span></div></div>
    <div class="way"><span class="ico">{ic('mail')}</span><div><b>Email</b><span><span class="ph">[Email address]</span></span></div></div>
    <div class="way"><span class="ico">{ic('pin')}</span><div><b>Where</b><span>Nairobi, Kenya</span></div></div>
  </div>
  <form class="card" id="demoForm">
    <div class="two"><label>Your name<input name="name" required autocomplete="name"></label><label>Company<input name="company" required autocomplete="organization"></label></div>
    <div class="two"><label>Phone<input name="phone" type="tel" autocomplete="tel"></label><label>Email<input name="email" type="email" autocomplete="email"></label></div>
    <div class="two"><label>Interested in<select name="about"><option value="inventory">Inventory</option><option value="projects">Projects (coming soon)</option><option value="books">Books (coming soon)</option><option value="all">All in one</option></select></label>
    <label>Number of sites<select name="sites"><option>1</option><option>2–5</option><option>6–10</option><option>More than 10</option></select></label></div>
    <label>Anything else<textarea name="note" rows="3"></textarea></label>
    <button class="btn pri" type="submit">Send {ic('arrow')}</button>
    <p class="okMsg" id="okMsg" role="status"></p>
  </form>
</div>
'''
page('contact.html', 'Book a demo · Ostock', 'Book a free Ostock demo for your construction company.', contact)
print('built', sorted(p.name for p in OUT.glob('*.html')))
