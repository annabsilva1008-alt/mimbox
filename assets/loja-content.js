/* Pontos editoriais da vitrine aprovada. Catálogo e compra não são alterados. */
(() => {
  'use strict';
  const main=document.querySelector('main');if(!main)return;
  function editorial(id,anchor,alt){
    if(!anchor||document.getElementById(id))return;
    const figure=document.createElement('figure');figure.className='mimbox-editorial';figure.dataset.cmsOptional='';figure.hidden=true;
    const image=document.createElement('img');image.id=id;image.alt=alt;image.loading='lazy';image.decoding='async';image.hidden=true;figure.append(image);anchor.append(figure);
  }
  editorial('cms-loja-colecoes-imagem',document.querySelector('.m-categories'),'Apresentação das coleções Mimbox');
  editorial('cms-loja-destaque-imagem',document.querySelector('#boxes'),'Destaque da loja Mimbox');
  const notice=document.createElement('p');notice.className='mimbox-editor-notice';notice.dataset.cmsNotice='';notice.hidden=true;main.prepend(notice);
  document.querySelectorAll('a[href]').forEach(a=>{try{if(/(^|\.)instagram\.com$/.test(new URL(a.href,location.origin).hostname))a.dataset.cmsContact='instagram';}catch{}});
  const style=document.createElement('style');style.textContent='.mimbox-editorial{margin:24px auto;max-width:1150px}.mimbox-editorial img{display:block;width:100%;height:auto;max-height:560px;object-fit:contain;border-radius:14px}.mimbox-editor-notice{margin:16px auto;padding:14px 20px;max-width:1150px;background:#fffdf7;border:1px solid #ded6c8;border-radius:9px;text-align:center}.mimbox-editorial[hidden],.mimbox-editor-notice[hidden]{display:none!important}.m-category-tile .mimbox-collection-description{display:block;padding:0 14px 16px;font-size:13px;line-height:1.5;color:#211b1b;text-align:center;text-transform:none}';document.head.append(style);
  let collections=[];
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const tiles=document.querySelector('.m-category-grid');
  function descriptions(){
    if(!tiles)return;
    for(const tile of tiles.querySelectorAll('[data-colecao]')){
      const c=collections.find(c=>norm(c.nome)===norm(tile.dataset.colecao));
      let note=tile.querySelector('.mimbox-collection-description');const text=typeof c?.descricao==='string'?c.descricao.trim():'';
      if(!text){note?.remove();continue;}
      if(!note){note=document.createElement('small');note.className='mimbox-collection-description';tile.append(note);}if(note.textContent!==text)note.textContent=text;
    }
  }
  document.addEventListener('mimbox:content',event=>{try{const data=JSON.parse(event.detail?.colecoes_json||'[]');collections=Array.isArray(data)?data:[];}catch{collections=[];}descriptions();});
  if(tiles)new MutationObserver(descriptions).observe(tiles,{childList:true,subtree:true});
  const grid=document.querySelector('.collection-grid');
  function highlights(){
    const products=new Map((window.mimboxPublicProducts||[]).map(p=>[String(p.id),p]));
    for(const card of grid?.querySelectorAll('[data-crm-produto-id]')||[]){
      const featured=products.get(card.dataset.crmProdutoId)?.destaque===true;let badge=card.querySelector('.mimbox-featured-label');
      if(!featured){badge?.remove();continue;}if(!badge){badge=document.createElement('small');badge.className='mimbox-featured-label';badge.textContent='Destaque';badge.style.cssText='display:inline-block;font-weight:700;padding:4px 8px;background:#f8d43a;border-radius:5px;margin:0 0 8px';card.querySelector('.product-info')?.prepend(badge);}
    }
  }
  if(grid){new MutationObserver(highlights).observe(grid,{childList:true,subtree:true});highlights();}
})();

/* All fields already offered by the original Gerenciar Site portal. */
(function(global){
 'use strict';
 const bindings={
  hero_titulo:['text','#hero-title'],hero_subtitulo:['text','#hero-description'],hero_imagem:['image','#hero-image'],hero_botao_texto:['text','#hero-link'],hero_botao_link:['link','#hero-link'],
  inicio_personalizados_imagem:['image','#personalizados-image'],inicio_loja_imagem:['image','#loja-image'],inicio_negocios_imagem:['image','#negocios-image'],
  personalizados_titulo:['text','#cms-personalizados-titulo'],personalizados_subtitulo:['text','#cms-personalizados-subtitulo'],personalizados_banner_imagem:['image','#cms-personalizados-banner-imagem'],personalizados_copos_imagem:['image','#cms-personalizados-copos-imagem'],personalizados_pratos_imagem:['image','#cms-personalizados-pratos-imagem'],personalizados_brindes_imagem:['image','#cms-personalizados-brindes-imagem'],
  loja_titulo:['text','.m-hero-left h1'],loja_subtitulo:['text','.m-hero-left p'],loja_banner_imagem:['image','.m-hero-photo img'],loja_botao_texto:['text','.m-hero-left a'],loja_botao_link:['link','.m-hero-left a'],loja_colecoes_imagem:['image','#cms-loja-colecoes-imagem'],loja_destaque_imagem:['image','#cms-loja-destaque-imagem'],
  negocios_titulo:['text','#cms-negocios-titulo'],negocios_subtitulo:['text','#cms-negocios-subtitulo'],negocios_banner_imagem:['image','#cms-negocios-banner'],negocios_brindes_imagem:['image','#cms-negocios-brindes'],negocios_personalizados_imagem:['image','#cms-negocios-personalizados'],negocios_botao_texto:['text','#cms-negocios-botao'],negocios_botao_link:['link','#cms-negocios-botao'],
  sobre_titulo:['text','#cms-sobre-titulo'],sobre_texto:['text','#cms-sobre-texto'],sobre_banner_imagem:['image','#cms-sobre-banner'],sobre_ana_imagem:['image','#cms-sobre-ana'],sobre_rafa_imagem:['image','#cms-sobre-rafa'],
  blog_titulo:['text','#cms-blog-titulo'],blog_subtitulo:['text','#cms-blog-subtitulo'],blog_banner_imagem:['image','#cms-blog-banner']
 };
 const nonempty=value=>typeof value==='string'&&value.trim();
 const safeImage=value=>nonempty(value)&&/^https:\/\/[^\s]+$/i.test(value.trim());
 const safeLink=value=>nonempty(value)&&(/^\/(?!\/)/.test(value)||/^#[^\s]+$/.test(value)||/^https:\/\/[^\s]+$/i.test(value));
 function image(el,url){
  if(el.dataset.cmsSource===url)return;
  const previous={src:el.getAttribute('src'),srcset:el.getAttribute('srcset')};
  const show=()=>{el.hidden=false;const optional=el.closest('[data-cms-optional]');if(optional)optional.hidden=false;const banner=el.closest('[data-cms-banner]');if(banner){banner.classList.add('has-cms-banner');banner.querySelectorAll('[data-cms-fallback]').forEach(x=>x.hidden=true)}};
  el.onload=show;el.onerror=()=>{el.onload=null;el.onerror=null;if(previous.src){el.src=previous.src;if(previous.srcset)el.srcset=previous.srcset;else el.removeAttribute('srcset')}else el.hidden=true};
  if(global.mimboxSetImage)global.mimboxSetImage(el,url,1600);else{el.removeAttribute('srcset');el.src=url;}
  el.dataset.cmsSource=url;if(el.complete&&el.naturalWidth>0)show();
 }
 function phone(value){let digits=String(value||'').replace(/\D/g,'');if(digits.length===10||digits.length===11)digits='55'+digits;return /^\d{12,15}$/.test(digits)?digits:null}
 function apply(content){
  if(!content||typeof content!=='object')return[];const applied=[];
  for(const [key,[type,selector]] of Object.entries(bindings)){
   const value=content[key];if(!nonempty(value))continue;
   const elements=document.querySelectorAll(selector);if(!elements.length)continue;
   if(type==='image'&&!safeImage(value)||type==='link'&&!safeLink(value))continue;
   elements.forEach(el=>{if(type==='text')el.textContent=value.trim();else if(type==='image')image(el,value.trim());else el.href=value.trim()});applied.push(key);
  }
  if(document.body.classList.contains('mb-index')){
   if(nonempty(content.seo_titulo)){document.title=content.seo_titulo.trim();document.querySelector('meta[property="og:title"]')?.setAttribute('content',content.seo_titulo.trim());applied.push('seo_titulo')}
   if(nonempty(content.seo_descricao)){document.querySelector('meta[name="description"]')?.setAttribute('content',content.seo_descricao.trim());document.querySelector('meta[property="og:description"]')?.setAttribute('content',content.seo_descricao.trim());applied.push('seo_descricao')}
  }
  const number=phone(content.whatsapp);
  if(number){document.querySelectorAll('a[href]').forEach(a=>{try{const url=new URL(a.href,location.origin);if(url.hostname==='wa.me'){url.pathname='/'+number;a.href=url.href;if(a.dataset.cmsContact==='whatsapp')a.textContent='WhatsApp · +'+number+' ↗'}else if(a.protocol==='tel:'){a.href='tel:+'+number;a.textContent='+'+number}}catch{}});applied.push('whatsapp')}
  if(safeImage(content.instagram)){document.querySelectorAll('[data-cms-contact="instagram"],#instagram-link').forEach(a=>{a.href=content.instagram.trim();try{const u=new URL(content.instagram);const handle=u.pathname.split('/').filter(Boolean)[0];if(handle&&/(^|\.)instagram\.com$/.test(u.hostname))a.textContent=a.id==='instagram-link'?'Instagram · @'+handle+' ↗':'@'+handle}catch{}});applied.push('instagram')}
  if(typeof content.aviso==='string'){document.querySelectorAll('[data-cms-notice]').forEach(el=>{el.textContent=content.aviso.trim();el.hidden=!content.aviso.trim()});applied.push('aviso')}
  document.dispatchEvent(new CustomEvent('mimbox:content',{detail:content}));return applied;
 }
 let active=null;
 function load(){if(!active)active=fetch('/api/admin-gerenciar?action=site_publico',{cache:'no-store',credentials:'omit'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.ok&&data.conteudo)return apply(data.conteudo);return[]}).catch(()=>[]);return active}
 global.MimboxContent=Object.freeze({bindings,apply,load});load();
})(window);
