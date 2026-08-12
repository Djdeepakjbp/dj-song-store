const params=new URLSearchParams(location.search), id=params.get("id");
async function load(){
 const p=await fetch("/api/products/"+encodeURIComponent(id)).then(r=>r.ok?r.json():null);
 const c=await fetch("/api/config").then(r=>r.json()); storeName.textContent=c.storeName; document.title=p?`${p.title} • ${c.storeName}`:"Song";
 if(!p){song.innerHTML="<div class='panel'><h2>Song not found</h2></div>";return}
 let qr=""; try{qr=(await fetch("/api/products/"+encodeURIComponent(id)+"/qr").then(r=>r.json())).dataUrl}catch{}
 song.innerHTML=`<div class="song-box"><div><img class="cover" src="${esc(p.cover)}"></div><div><span class="pill">DIGITAL DOWNLOAD</span><h1>${esc(p.title)}</h1><p class="muted">${esc(p.artist)}</p><p>${esc(p.description)}</p><div class="price">₹${p.price}</div>${p.preview?`<audio controls style="width:100%;margin:10px 0" src="${esc(p.preview)}"></audio>`:""}<div class="notice">📱 QR scan करके इसी song page पर आएं, फिर <b>Pay & Download</b> दबाएं। Payment successful होने पर download link मिलेगा.</div><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">${qr?`<img class="qr" src="${qr}" alt="QR Code">`:""}<button onclick="pay('${esc(p.id)}')">💳 Pay ₹${p.price} & Download</button></div><div id="status"></div></div></div>`;
}
async function pay(productId){
 status.innerHTML="<div class='notice'>Payment window opening…</div>";
 const r=await fetch("/api/create-order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId})});
 const d=await r.json(); if(!r.ok){status.innerHTML=`<div class="notice">${esc(d.error)}</div>`;return}
 const options={key:d.keyId,amount:d.amount,currency:d.currency,name:"DJ Song Store",description:d.product.title,order_id:d.orderId,theme:{color:"#ff3d81"},
 handler:async function(resp){
  status.innerHTML="<div class='notice'>Payment verify ho raha hai…</div>";
  const vr=await fetch("/api/verify-payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(resp)});
  const out=await vr.json();
  if(out.success) status.innerHTML=`<div class="notice success"><h3>✅ Payment Successful</h3><p>Aapka song ready hai.</p><a class="btn" href="${out.downloadUrl}">⬇️ Download Song</a><p class="muted">Link 24 hours tak valid hai.</p></div>`;
  else status.innerHTML=`<div class="notice">${esc(out.error||"Verification failed")}</div>`;
 }};
 new Razorpay(options).open();
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
load();