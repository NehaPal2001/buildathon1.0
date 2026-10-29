const css = `
:root{--bg:#f4f7f9;--card:#fff;--ink:#17252f;--muted:#5d7080;--line:#dbe3e9;--brand:#0f766e;--brand-d:#0b5a54;--err:#b42318;--errbg:#fef3f2;--ok:#067647;--okbg:#ecfdf3}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--card);border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:12px 28px;align-items:center;padding:12px 24px}
header .brand{font-weight:700;font-size:1.15rem;color:var(--brand);text-decoration:none}
nav{display:flex;flex-wrap:wrap;gap:4px 18px}
nav a{color:var(--ink);text-decoration:none;padding:4px 0;border-bottom:2px solid transparent}
nav a:hover{border-color:var(--brand)}
main{max-width:860px;margin:28px auto;padding:0 20px}
h1{margin:0 0 4px;font-size:1.7rem}
.sub{color:var(--muted);margin:0 0 20px}
ul.cards{list-style:none;margin:0;padding:0;display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card,ul.cards>li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.card{margin-bottom:16px}
ul.cards h2,.card h2{margin:0 0 4px;font-size:1.05rem}
.muted{color:var(--muted)}
.price{font-weight:600}
label{display:block;font-weight:600;margin:14px 0 4px}
input,select{width:100%;padding:9px 10px;font:inherit;border:1px solid var(--line);border-radius:8px;background:#fff}
input:focus,select:focus,button:focus-visible,a:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.btn,button{display:inline-block;margin-top:14px;padding:9px 16px;font:inherit;font-weight:600;color:#fff;background:var(--brand);border:0;border-radius:8px;cursor:pointer;text-decoration:none}
.btn:hover,button:hover{background:var(--brand-d)}
button.danger{background:#fff;color:var(--err);border:1px solid var(--err)}
button.danger:hover{background:var(--errbg)}
.btn.small,button.small{margin-top:8px;padding:6px 12px;font-size:.9rem}
.banner{padding:12px 14px;border-radius:8px;margin:0 0 18px;border:1px solid}
.banner.error{background:var(--errbg);color:var(--err);border-color:#fda29b}
.banner.ok{background:var(--okbg);color:var(--ok);border-color:#75e0a7}
.empty{padding:28px;text-align:center;color:var(--muted);background:var(--card);border:1px dashed var(--line);border-radius:10px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:#eef3f6;font-size:.85rem;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
.status{display:inline-block;padding:2px 10px;border-radius:99px;font-size:.8rem;font-weight:700}
.status.BOOKED{background:var(--okbg);color:var(--ok)}
.status.CANCELLED{background:#f2f4f7;color:var(--muted)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 20px;margin:0}
dt{color:var(--muted)} dd{margin:0}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.row>*{flex:1 1 200px} .row button{flex:0 0 auto}
@media(max-width:560px){header{padding:10px 16px}main{margin:18px auto}h1{font-size:1.4rem}table,thead,tbody,tr,th,td{display:block}thead{display:none}tr{border-bottom:1px solid var(--line);padding:8px 0}td{border:0;padding:3px 12px}}
`;

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · CareSlot Clinic</title><style>${css}</style></head>
<body>
<header data-testid="header">
  <a href="/" class="brand" data-testid="nav-home">CareSlot Clinic</a>
  <nav aria-label="Main">
    <a href="/" data-testid="nav-services">Services</a>
    <a href="/providers" data-testid="nav-providers">Providers</a>
    <a href="/book" data-testid="nav-book">Book</a>
    <a href="/appointments" data-testid="nav-appointments">My appointments</a>
    <a href="/account" data-testid="nav-account">Account</a>
  </nav>
</header>
<main>
${body}
</main>
</body></html>`;
}
