(function(){
const CUP_MODELS = [
  {key: 'americano', label: 'Americano', ml: null, base: 10, over10: 8, over50: 6},
  ...['Long Drink', 'Long Drink Estelar', 'Tulipa'].flatMap(label => [200, 300].map(ml => ({
    key: label.toLowerCase().replaceAll(' ', '-') + '-' + ml,
    label, ml, base: ml === 200 ? 15 : 20, over10: ml === 200 ? 13 : 18, over50: ml === 200 ? 12 : 16
  })))
];
const CUP_LIMIT = 500;
function cupTitle(model) { return model.label + (model.ml ? ' ' + model.ml + ' ml' : ''); }
function cupCollection(model, over10 = model.over10, over50 = model.over50) {
  return 'Personalizados — Copos — ' + cupTitle(model) + ' | 11+: ' + over10 + ' | 51+: ' + over50;
}
function cupSpec(product) {
  const match = /^Personalizados — Copos — (.+) \| 11\+: (\d+(?:[.,]\d{1,2})?) \| 51\+: (\d+(?:[.,]\d{1,2})?)$/.exec(String(product?.colecao || '').trim());
  if (!match) return null;
  const model = CUP_MODELS.find(m => cupTitle(m) === match[1]);
  const base = Number(product.preco), over10 = Number(match[2].replace(',', '.')), over50 = Number(match[3].replace(',', '.'));
  if (!model || !Number.isFinite(base) || base <= 0 || over10 <= 0 || over50 <= 0 || over10 > base || over50 > over10) return null;
  return {...model, base, over10, over50};
}
function cupUnitPrice(spec, count) { return count > 50 ? spec.over50 : count > 10 ? spec.over10 : spec.base; }
function priceCupCart(items, products) {
  const rows = items.map(item => ({item, product: products.find(p => String(p.id) === String(item.id))}));
  const count = rows.reduce((sum, row) => sum + (cupSpec(row.product) ? Number(row.item.qty ?? row.item.quantity ?? 1) : 0), 0);
  if (!Number.isSafeInteger(count) || count < 0 || count > CUP_LIMIT) throw Error('Escolha até ' + CUP_LIMIT + ' copos por pedido.');
  return {count, items: rows.map(({item, product}) => {
    const spec = cupSpec(product), qty = Number(item.qty ?? item.quantity ?? 1);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > (spec ? CUP_LIMIT : 20)) throw Error('Quantidade inválida.');
    if (!product || product.disponivel !== true || !Number.isFinite(Number(product.preco)) || Number(product.preco) <= 0) throw Error('Produto indisponível.');
    const price = spec ? cupUnitPrice(spec, count) : Number(product.preco);
    return {...item, id: String(product.id), quantity: qty, qty, price, name: String(product.nome), cup: spec};
  })};
}

window.MimboxCups=Object.freeze({CUP_MODELS,CUP_LIMIT,cupTitle,cupCollection,cupSpec,cupUnitPrice,priceCupCart});
})();
