async function load(){
 const c=await fetch("/api/config").then(r=>r.json()); document.title=c.storeName; storeName.textContent=c.storeName; tagline.textContent=c.tagline;
 const ps=await fetch("/api/products").then(r=>r.json()); const el=document.getElementById("products");
 el.innerHTML=ps.map(p=>`<article class="card"><img class="cover" src="${esc(p.cover)}"><h3>${esc(p.title)}</h3><div class="muted">${esc(p.artist)}</div><div class="price">₹${p.price}</div><a class="btn" href="/song.html?id=${encodeURIComponent(p.id)}">🎵 Buy & Download</a></article>`).join("") || "<p>No songs added yet.</p>";
 year.textContent=new Date().getFullYear();
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
load();