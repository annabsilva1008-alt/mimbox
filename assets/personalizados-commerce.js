(async function () {
  'use strict';
  const config = window.MimboxCustomModels;
  const cards = [...document.querySelectorAll('[data-model-key]')];
  if (!config || !cards.length) return;
  const message = document.getElementById('custom-catalog-status');
  try {
    const response = await fetch('/api/admin-produtos?publico=1', {cache: 'no-store', credentials: 'omit'});
    if (!response.ok) throw Error('Catálogo indisponível');
    const result = await response.json();
    if (!Array.isArray(result.produtos)) throw Error('Resposta inválida');
    let available = 0;
    for (const card of cards) {
      const model = config.models.find(m => m.key === card.dataset.modelKey);
      const matches = result.produtos.filter(p => model && config.matches(p, model));
      if (matches.length !== 1) continue;
      const p = matches[0], price = Number(p.preco);
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(p.id) || p.disponivel !== true || !Number.isFinite(price) || price <= 0) continue;
      const link = card.querySelector('[data-model-buy]');
      card.querySelector('[data-model-price]').textContent = price.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) + ' / unidade';
      link.href = 'https://www.mimbox.com.br/produto.html?id=' + encodeURIComponent(p.id);
      link.textContent = 'Comprar personalizado →';
      link.setAttribute('aria-label', 'Comprar ' + model.name);
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
      available++;
    }
    if (message) message.textContent = available ? 'Escolha o modelo, compre pelo site e envie a arte após o pagamento.' : 'Os modelos estão sendo preparados para compra online. Os preços aparecerão aqui assim que estiverem disponíveis.';
  } catch {
    if (message) message.textContent = 'Não foi possível carregar os preços agora. Atualize a página para tentar novamente.';
  }
})();
