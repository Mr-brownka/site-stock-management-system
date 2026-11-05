# Ostock website

The public company website (ostock.co.ke): Home, Products, Announcements, Blog, About, Book a demo.
Plain static HTML, kept apart from the stock app in the folder above, so changes here never touch the live app.

- Edit `build.py` (pages, nav, footer, announcements, blog list), then run `python3 build.py .` in this folder.
- Styles: `site.css` (Ostock brand palette). Behaviour: `site.js` (menu, demo form).
- Placeholders still to fill: `[WhatsApp number]`, `[Email address]`; set `CONTACT` in `site.js` so the demo form opens WhatsApp or email.
- Hosting: deploy as its own Vercel project with Root Directory `website` (no build command).
