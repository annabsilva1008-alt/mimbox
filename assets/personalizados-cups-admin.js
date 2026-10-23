(function () {
  'use strict';
  if (!window.MimboxCups || typeof window.products !== 'function') return;
  const original = window.products, rules = window.MimboxCups;
  window.products = function (area) {
    original(area);
    const section = card('Copos personalizados: modelos e descontos');
    section.append(element('p', 'Os preços abaixo são por unidade. As faixas somam todos os copos do pedido: 1–10, 11–50 e 51 ou mais. Cada capacidade é um cadastro próprio. Você pode ocultar uma opção que não oferece na lista de produtos.', 'muted'));
    for (const model of rules.CUP_MODELS) {
      const matches = state.produtos.filter(p => rules.cupSpec(p)?.key === model.key);
      const box = element('form', undefined, 'item'); box.append(element('h3', rules.cupTitle(model)));
      if (matches.length > 1) { box.append(element('p', 'Há cadastros duplicados deste modelo. Revise a lista de produtos.')); section.append(box); continue; }
      const current = matches[0], values = current ? rules.cupSpec(current) : model;
      const fields = [['base', '1 a 10 unidades'], ['over10', '11 a 50 unidades'], ['over50', '51 ou mais unidades']].map(([key, text]) => {
        const f = field(text + ' — preço por unidade (R$)', values[key], 'number'); f.input.min = '0.01'; f.input.required = true;
        f.input.id = 'cup-price-' + model.key + '-' + key; f.wrap.querySelector('label').htmlFor = f.input.id; box.append(f.wrap); return [key, f.input];
      });
      const button = element('button', current ? 'Salvar preços deste copo' : 'Cadastrar este copo', 'btn'); button.type = 'submit'; box.append(button);
      box.onsubmit = async event => {
        event.preventDefault(); if (!box.reportValidity()) return;
        const prices = Object.fromEntries(fields.map(([key, input]) => [key, Number(input.value)]));
        if (prices.over10 > prices.base || prices.over50 > prices.over10) { notify('O desconto deve reduzir ou manter o valor da faixa anterior.', true); return; }
        button.disabled = true;
        try {
          const product = {
            nome: current?.nome || 'Copo ' + rules.cupTitle(model) + ' — Sua arte aqui',
            colecao: rules.cupCollection(model, prices.over10, prices.over50), preco: prices.base,
            descricao: current?.descricao || 'Uma unidade de copo ' + rules.cupTitle(model) + ' personalizado com a sua arte. Desconto automático pelo total de copos do pedido. Após pagar, clique em Continuar na InfinitePay para voltar à Mimbox e enviar a arte como documento no WhatsApp com o número do pedido. Produção após o pagamento e a aprovação da arte. Imagem ilustrativa dos modelos.\n[[MIMBOX_CATEGORIA:Personalizados;TAGS:Copos]]',
            imagem_url: current?.imagem_url || 'https://www.mimbox.com.br/assets/copos-modelos-1536.webp',
            disponivel: current ? current.disponivel === true : false, destaque: current?.destaque === true, ordem: current?.ordem ?? 0
          };
          if (current) {
            const result = await operations('produto_editar', {id: current.id, produto: product}); if (!result.ok) throw Error('Não foi possível atualizar o copo.');
          } else {
            await request('/api/admin-salvar-produto', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(product)});
          }
          await openPage('produtos'); notify('Copo salvo. A disponibilidade pode ser ativada na lista de produtos.');
        } catch (error) { notify(error.message, true); } finally { button.disabled = false; }
      };
      section.append(box);
    }
    area.prepend(section);
  };
})();
