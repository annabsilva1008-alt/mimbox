(function () {
  'use strict';
  const rules = window.MimboxCups;
  if (!rules) return;
  const mounted = new WeakMap();
  let serial = 0;
  const tiers = [['base', '1 a 10 unidades'], ['over10', '11 a 50 unidades'], ['over50', '51 ou mais unidades']];
  const money = value => Number(value).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  function identify(product) {
    const title = /^Personalizados — Copos — (.+?) \|/.exec(String(product.colecao || ''))?.[1];
    return rules.CUP_MODELS.find(model => rules.cupTitle(model) === title);
  }
  function prices(product) {
    const match = /\| 11\+: ([\d.,]+) \| 51\+: ([\d.,]+)$/.exec(String(product.colecao || ''));
    return match ? {base: Number(product.preco), over10: Number(match[1].replace(',', '.')), over50: Number(match[2].replace(',', '.'))} : null;
  }
  async function api(url, options = {}) {
    const response = await fetch(url, {credentials: 'same-origin', cache: 'no-store', ...options});
    let result; try { result = await response.json(); } catch { throw Error('Resposta inválida do servidor. Tente novamente.'); }
    if (!response.ok) throw Error(result.erro || result.error || 'Não foi possível acessar o painel.');
    return result;
  }
  async function catalog() {
    const result = await api('/api/admin-operacoes?acao=produtos');
    if (result.ok === false || !Array.isArray(result.produtos)) throw Error('Não foi possível carregar os copos.');
    return result.produtos;
  }
  function same(a, b) { return a && b && tiers.every(([key]) => Number(a[key]) === Number(b[key])); }
  function productData(current, model, value) {
    return {
      nome: current?.nome || 'Copo ' + rules.cupTitle(model) + ' — Sua arte aqui',
      colecao: rules.cupCollection(model, value.over10, value.over50), preco: value.base,
      descricao: current?.descricao || 'Copo ' + rules.cupTitle(model) + ' personalizado com a sua arte. Após o pagamento, envie a arte pelo WhatsApp com o número do pedido. Produção após pagamento e aprovação da arte. Imagem ilustrativa.\n[[MIMBOX_CATEGORIA:Personalizados;TAGS:Copos]]',
      imagem_url: current?.imagem_url || 'https://www.mimbox.com.br/assets/copos-modelos-1536.webp',
      disponivel: current ? current.disponivel === true : false,
      destaque: current?.destaque === true,
      ordem: current?.ordem ?? 0
    };
  }
  function mount(container, options = {}) {
    if (mounted.get(container)?.root.isConnected) return mounted.get(container);
    const root = el('section', undefined, 'mb-cup-editor');
    root.setAttribute('aria-label', 'Preços dos copos personalizados');
    const uid = 'cup-editor-' + (++serial), forms = [];
    let products = [], saving = false;
    const heading = el('h2', 'Preços dos copos personalizados');
    const intro = el('p', 'Altere os três preços por unidade e clique em Salvar preços. As mudanças valem no site e na compra, sem precisar alterar código. Os descontos somam todos os copos do pedido.');
    const links = el('p');
    const page = el('a', 'Ver Personalizados ↗'); page.href = '/personalizados.html#copos'; page.target = '_blank'; page.rel = 'noopener'; links.append(page);
    if (options.contentLink !== false) { const content = el('a', 'Fotos e textos da página →'); content.href = '/gerenciar-site.html#personalizados'; links.append(document.createTextNode(' · '), content); }
    const status = el('p', 'Carregando preços atuais…'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const reload = el('button', 'Recarregar preços', 'mb-cup-admin-secondary'); reload.type = 'button';
    const groups = el('div', undefined, 'mb-cup-admin-groups');
    const details = el('details', undefined, 'mb-cup-admin-individual'); details.append(el('summary', 'Ajustar um modelo individual ou cadastrar opção ausente'));
    root.append(heading, intro, links, status, reload, groups, details); container.append(root);
    if (!document.getElementById('cup-admin-styles')) {
      const style = el('style'); style.id = 'cup-admin-styles'; style.textContent = '.mb-cup-editor{background:#fffdf8;border:1px solid #ded6c8;border-radius:10px;padding:24px;margin:20px 0;color:#211b1b}.mb-cup-editor h2{color:#2355ac;font-size:25px;margin:0 0 12px}.mb-cup-editor p{line-height:1.7;font-size:13px}.mb-cup-editor a{color:#2355ac;font-weight:700}.mb-cup-admin-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:20px}.mb-cup-price-form{padding:18px;border:1px solid #ded6c8;border-radius:8px;min-width:0}.mb-cup-price-form h3{font-size:19px;color:#2355ac;margin:0 0 8px}.mb-cup-price-form label{display:block;font-size:12px;font-weight:700;line-height:1.5;margin:14px 0 6px}.mb-cup-price-form input{display:block;width:100%;min-width:0;min-height:44px;font:inherit;font-size:16px;padding:10px;border:1px solid #a8a196;border-radius:5px;background:white;color:#211b1b}.mb-cup-price-form button,.mb-cup-admin-secondary{font:inherit;font-weight:700;border:0;padding:12px 16px;min-height:44px;border-radius:5px;cursor:pointer;background:#2355ac;color:#fff;margin-top:16px}.mb-cup-admin-secondary{background:#eee7da;color:#2355ac;margin:0}.mb-cup-editor button:disabled{opacity:.55;cursor:wait}.mb-cup-editor [data-error=true]{color:#a42c20}.mb-cup-editor [role=status]{min-height:1em}.mb-cup-admin-individual{margin-top:20px}.mb-cup-admin-individual>summary{cursor:pointer;color:#2355ac;font-weight:700;padding:10px 0}.mb-cup-admin-individual .mb-cup-price-form{margin-top:12px}.mb-cup-price-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.mb-cup-admin-groups .mb-cup-price-fields{grid-template-columns:1fr}@media(max-width:1050px){.mb-cup-admin-groups{grid-template-columns:1fr}.mb-cup-admin-groups .mb-cup-price-fields{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.mb-cup-editor{padding:16px}.mb-cup-price-fields,.mb-cup-admin-groups .mb-cup-price-fields{grid-template-columns:1fr}}'; document.head.append(style);
    }
    function matches(model) { return products.filter(p => identify(p)?.key === model.key); }
    function valuesFor(models) {
      const rows = models.flatMap(matches);
      if (!rows.length) return {...models[0]};
      const first = prices(rows[0]);
      return first && rows.every(p => same(prices(p), first)) ? first : {base: '', over10: '', over50: ''};
    }
    function updateForms() {
      for (const entry of forms) {
        const rows = entry.models.flatMap(matches), value = valuesFor(entry.models);
        entry.summary.textContent = rows.length ? rows.map(p => { const model = identify(p); return rules.cupTitle(model) + (p.disponivel ? '' : ' (oculto)'); }).join(' · ') : 'Ainda não cadastrado. Novos cadastros começam ocultos.';
        if (!entry.dirty) for (const [key, input] of entry.inputs) input.value = value[key];
        entry.button.textContent = !rows.length && entry.models.length === 1 ? 'Cadastrar este copo' : 'Salvar preços';
      }
    }
    async function load() {
      status.textContent = 'Carregando preços atuais…'; reload.disabled = true;
      try { products = await catalog(); if (!forms.length) buildForms(); updateForms(); status.textContent = 'Preços carregados. Cada botão salva somente os copos indicados no seu quadro.'; status.dataset.error = 'false'; }
      catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
      finally { reload.disabled = false; }
    }
    function buildForm(title, models, parent, key) {
      const form = el('form', undefined, 'mb-cup-price-form'); form.dataset.cupEditor = key;
      form.append(el('h3', title)); const summary = el('p'); form.append(summary);
      const fields = el('div', undefined, 'mb-cup-price-fields');
      const inputs = tiers.map(([name, label]) => {
        const wrap = el('div'), input = el('input'), caption = el('label', label + ' — R$ por unidade');
        input.type = 'number'; input.min = '0.01'; input.step = '0.01'; input.required = true; input.inputMode = 'decimal'; input.id = uid + '-' + key + '-' + name;
        caption.htmlFor = input.id; input.placeholder = 'Informe o valor'; wrap.append(caption, input); fields.append(wrap); return [name, input];
      });
      const button = el('button', 'Salvar preços'); button.type = 'submit';
      const feedback = el('p'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
      form.append(fields, button, feedback); parent.append(form);
      const entry = {form, models, inputs, button, feedback, summary, dirty: false}; forms.push(entry);
      form.addEventListener('input', () => { entry.dirty = true; feedback.textContent = 'Alterações ainda não salvas.'; feedback.dataset.error = 'false'; });
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (saving || !form.reportValidity()) return;
        const value = Object.fromEntries(inputs.map(([name, input]) => [name, Number(input.value)]));
        if (tiers.some(([name]) => !Number.isFinite(value[name]) || value[name] <= 0) || value.over10 > value.base || value.over50 > value.over10) { feedback.textContent = 'Use valores positivos. O preço de 11 a 50 deve ser menor ou igual ao de 1 a 10; o de 51 ou mais deve ser menor ou igual ao de 11 a 50.'; feedback.dataset.error = 'true'; return; }
        saving = true; reload.disabled = true; for (const f of forms) f.button.disabled = true; inputs.forEach(([,input]) => input.disabled = true);
        const completed = [];
        try {
          const latest = await catalog();
          const targets = models.map(model => { const rows = latest.filter(p => identify(p)?.key === model.key); if (rows.length > 1) throw Error('Há cadastros duplicados de ' + rules.cupTitle(model) + '. Revise em Produtos.'); if (!rows.length && models.length > 1) throw Error('Cadastre primeiro ' + rules.cupTitle(model) + ' no ajuste individual.'); return {model, current: rows[0]}; });
          for (const {model, current} of targets) {
            feedback.textContent = 'Salvando ' + rules.cupTitle(model) + '…';
            const produto = productData(current, model, value);
            const result = current ? await api('/api/admin-operacoes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({acao:'produto_editar',id:current.id,produto})}) : await api('/api/admin-salvar-produto', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(produto)});
            if (current && result.ok !== true || !current && !result.produto?.id) throw Error('O servidor não confirmou o salvamento de ' + rules.cupTitle(model) + '.');
            completed.push({id: current?.id || result.produto.id, model});
          }
          products = await catalog();
          if (!completed.every(item => same(prices(products.find(p => p.id === item.id) || {}), value))) throw Error('Não foi possível confirmar todos os preços. Recarregue para conferir antes de tentar novamente.');
          entry.dirty = false; updateForms(); options.onSaved?.(products);
          const visible = completed.filter(item => products.find(p => p.id === item.id)?.disponivel === true);
          if (!visible.length) feedback.textContent = 'Preços salvos. Os modelos estão ocultos; a disponibilidade é controlada em Produtos.';
          else {
            try { const live = await api('/api/admin-produtos?publico=1&personalizados=copos'); if (!Array.isArray(live.produtos) || !visible.every(item => same(prices(live.produtos.find(p => p.id === item.id) || {}), value))) throw Error(); feedback.textContent = 'Preços salvos e confirmados no site. Pedidos já realizados mantêm os valores anteriores.'; }
            catch { feedback.textContent = 'Preços salvos no painel. A confirmação do catálogo público está indisponível; atualize a página de Personalizados para conferir.'; }
          }
          feedback.dataset.error = 'false';
        } catch (error) { feedback.textContent = error.message + (completed.length ? ' ' + completed.length + ' cadastro(s) já foram salvos. Recarregue os preços para conferir.' : ' Recarregue os preços para conferir antes de tentar novamente.'); feedback.dataset.error = 'true'; }
        finally { saving = false; reload.disabled = false; for (const f of forms) f.button.disabled = false; inputs.forEach(([,input]) => input.disabled = false); }
      });
    }
    function buildForms() {
      buildForm('Americano', rules.CUP_MODELS.filter(m => !m.ml), groups, 'grupo-americano');
      buildForm('Todos os copos de 200 ml', rules.CUP_MODELS.filter(m => m.ml === 200), groups, 'grupo-200');
      buildForm('Todos os copos de 300 ml', rules.CUP_MODELS.filter(m => m.ml === 300), groups, 'grupo-300');
      for (const model of rules.CUP_MODELS) buildForm(rules.cupTitle(model), [model], details, model.key);
    }
    reload.onclick = () => { if (saving || forms.some(f => f.dirty) && !confirm('Descartar os preços que ainda não foram salvos?')) return; forms.forEach(f => f.dirty = false); load(); };
    window.addEventListener('beforeunload', event => { if (root.isConnected && (saving || forms.some(f => f.dirty))) { event.preventDefault(); event.returnValue = ''; } });
    const controller = {root, reload: load, hasUnsaved: () => saving || forms.some(f => f.dirty), canLeave: () => { if (saving) { status.textContent = 'Aguarde a conclusão do salvamento antes de sair.'; return false; } return !forms.some(f => f.dirty) || confirm('Sair sem salvar os preços alterados?'); }}; mounted.set(container, controller); load(); return controller;
  }
  window.MimboxCupAdmin = Object.freeze({mount, canLeave(container) { const view = mounted.get(container); return !view?.root.isConnected || view.canLeave(); }});
})();
