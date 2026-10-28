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
