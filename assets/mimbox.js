(() => {
 'use strict';
 const menu=document.getElementById('menu'),toggle=document.getElementById('menu-toggle');
 const closeMenu=()=>{menu?.classList.remove('open');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Abrir menu')};
 toggle?.addEventListener('click',()=>{const open=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu')});
 menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu?.classList.contains('open')){closeMenu();toggle.focus()}});
 document.addEventListener('click',e=>{if(!e.target.closest('.mb-header'))closeMenu()});
 document.querySelectorAll('#year').forEach(el=>el.textContent=new Date().getFullYear());
 const updateCount=()=>{try{const c=JSON.parse(localStorage.getItem('mimbox-cart-v1')||'[]');const qty=Array.isArray(c)?c.filter(x=>x&&x.kind!=='club').reduce((n,x)=>n+Math.max(0,Number(x.qty)||0),0):0;document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=qty)}catch{}};
 updateCount();window.addEventListener('storage',updateCount);
 // Add product destinations after every catalogue refresh without interfering with add-to-cart.
 function productLinks(){document.querySelectorAll('.collection-grid .product-card').forEach(card=>{const id=card.dataset.crmProdutoId||card.querySelector('.add-to-cart')?.dataset.productId;if(!id||!/^[0-9a-f-]{36}$/i.test(id))return;let a=card.querySelector('.mb-product-detail');if(!a){a=document.createElement('a');a.className='mb-product-detail';a.textContent='Ver fotos e detalhes →';card.querySelector('.product-info')?.append(a)}a.href='/produto.html?id='+encodeURIComponent(id);const title=card.querySelector('h3');if(title&&!title.querySelector('a')){const link=document.createElement('a');link.href=a.href;link.textContent=title.textContent;title.replaceChildren(link)}})}
 const grid=document.querySelector('.collection-grid');if(grid){new MutationObserver(productLinks).observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['data-crm-produto-id']});productLinks()}
 // Accessible cart focus and background isolation; purchase handlers remain in the original script.
 const panel=document.getElementById('cart-panel');
 if(panel){const inertTargets=[...document.body.children].filter(el=>!['SCRIPT','STYLE'].includes(el.tagName)&&el!==panel&&el.id!=='cart-backdrop');let previouslyOpen=false;
  const sync=()=>{const open=!panel.hidden;if(open===previouslyOpen)return;previouslyOpen=open;inertTargets.forEach(el=>el.inert=open);if(open)document.getElementById('close-cart')?.focus()};
  new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['hidden']});sync();
  panel.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const els=[...panel.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(el=>el.getClientRects().length);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}});
 }
})();
