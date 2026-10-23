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


const ORIGIN_CEP = "04715005";

const PACKAGE = {
  width: 18,
  height: 9,
  length: 28,
  weight: 1.5
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  try {
    const cep = String(req.body?.cep || "").replace(/\D/g, "");

    if (!/^\d{8}$/.test(cep)) {
      return res.status(400).json({
        error: "Informe um CEP válido."
      });
    }

    let itemCount = Number(req.body?.itemCount ?? 1);
    let shippingProducts = null;
    let subtotal = Number(req.body?.subtotal ?? 0);
    const supplied = req.body?.items;
    if (supplied !== undefined) {
      if (!Array.isArray(supplied) || !supplied.length || supplied.length > 30 || supplied.some(i => !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(i?.id || "")))) return res.status(400).json({error:"Itens inválidos."});
      const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
      const key = process.env.SUPABASE_SECRET_KEY;
      if (!base || !key) return res.status(503).json({error:"Catálogo indisponível."});
      const ids = [...new Set(supplied.map(i => String(i.id)))];
      const catalog = await fetch(base + "/rest/v1/produtos?select=id,nome,preco,disponivel,colecao&id=in.(" + ids.join(",") + ")", {headers:{apikey:key,Authorization:"Bearer " + key}});
      if (!catalog.ok) return res.status(503).json({error:"Catálogo indisponível."});
      let priced;
      try { priced = priceCupCart(supplied, await catalog.json()); } catch(error) { return res.status(400).json({error:error.message}); }
      shippingProducts = priced.items.map(i => ({id:i.id,...PACKAGE,quantity:i.quantity,insurance_value:i.price}));
      itemCount = priced.items.reduce((n,i)=>n+i.quantity,0);
      subtotal = Math.round(priced.items.reduce((n,i)=>n+i.quantity*i.price,0)*100);
    }

    if (
      !Number.isInteger(itemCount) ||
      itemCount < 1 ||
      itemCount > (shippingProducts ? 500 : 100) ||
      !Number.isFinite(subtotal) ||
      subtotal < 0
    ) {
      return res.status(400).json({
        error: "Dados do carrinho inválidos."
      });
    }

    const token = process.env.MELHOR_ENVIO_TOKEN;

    if (!token) {
      return res.status(503).json({
        error: "Cotação de frete indisponível."
      });
    }

    const response = await fetch(
      "https://www.melhorenvio.com.br/api/v2/me/shipment/calculate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Mimbox (www.mimbox.com.br)"
        },
        body: JSON.stringify({
          from: { postal_code: ORIGIN_CEP },
          to: { postal_code: cep },
          ...(shippingProducts ? {products: shippingProducts} : {package: {
            ...PACKAGE,
            weight: Number((PACKAGE.weight * itemCount).toFixed(2))
          }}),
          options: {
            insurance_value: Number(
              (subtotal / 100).toFixed(2)
            ),
            receipt: false,
            own_hand: false
          }
        })
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !Array.isArray(data)) {
      return res.status(502).json({
        error: "Não foi possível consultar o frete."
      });
    }

    const opcoes = data
      .filter(opcao =>
        opcao &&
        !opcao.error &&
        opcao.id != null &&
        Number.isFinite(
          Number(opcao.custom_price ?? opcao.price)
        ) &&
        Number(opcao.custom_price ?? opcao.price) >= 0
      )
      .map(opcao => ({
        id: opcao.id,
        transportadora:
          opcao.company?.name || "Transportadora",
        servico: opcao.name,
        valor: Number(
          opcao.custom_price ?? opcao.price
        ),
        prazo:
          opcao.custom_delivery_time ??
          opcao.delivery_time
      }));

    return res.status(200).json({ opcoes });

  } catch (error) {
    console.error("Erro ao calcular frete:", error);

    return res.status(500).json({
      error: "Não foi possível calcular o frete."
    });
  }
}
