// Ostock website: menu, sticky nav line, gentle reveal, demo form.
// Fill these in when the real contact details are ready; the form then opens WhatsApp (or email) with the details typed in.
const CONTACT = { whatsapp: '', email: '' }; // whatsapp: '2547XXXXXXXX' (no +), email: 'hello@ostock.co.ke'

const btn = document.getElementById('menuBtn'), links = document.getElementById('links');
btn?.addEventListener('click', () => { const open = links.classList.toggle('open'); btn.setAttribute('aria-expanded', String(open)); });

const nav = document.getElementById('nav');
const onScroll = () => nav?.classList.toggle('stuck', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rv').forEach((el) => io.observe(el));
} else document.querySelectorAll('.rv').forEach((el) => el.classList.add('in'));

const form = document.getElementById('demoForm');
if (form) {
  const about = new URLSearchParams(location.search).get('about');
  if (about && form.about.querySelector(`option[value="${about}"]`)) form.about.value = about;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const text = `Hello Ostock, I'd like a demo.\nName: ${f.name}\nCompany: ${f.company}\nPhone: ${f.phone || '-'}\nEmail: ${f.email || '-'}\nInterested in: ${f.about}\nSites: ${f.sites}\n${f.note ? 'Note: ' + f.note : ''}`;
    const ok = document.getElementById('okMsg');
    if (CONTACT.whatsapp) location.href = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
    else if (CONTACT.email) location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent('Ostock demo · ' + f.company)}&body=${encodeURIComponent(text)}`;
    else { ok.textContent = 'Thank you. Demo booking opens soon. Please reach us on WhatsApp in the meantime.'; ok.style.display = 'block'; return; }
  });
}
