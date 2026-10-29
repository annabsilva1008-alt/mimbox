// IDs estáveis: nomes e preços podem mudar sem alterar pedidos já registrados.
const VARIATIONS_PREFIX = 'mimbox_variacoes_';
const CATEGORIES_KEY = 'mimbox_catalogo_categorias_v1';
const DEFAULT_CATEGORIES = ['Copos', 'Pratos', 'Boxes', 'Brindes', 'Personalizados'];
const catalogNameKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
const emptyVariations = () => ({titulo: 'Modelo', opcoes: [], revisao: ''});

function normalizeVariations(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.opcoes) || input.opcoes.length > 40) throw Error('Cadastre até 40 variações por produto.');
  const titulo = String(input.titulo || 'Modelo').trim();
  if (!titulo || titulo.length > 60) throw Error('O título das variações deve ter até 60 caracteres.');
  const ids = new Set(), names = new Set();
  const opcoes = input.opcoes.map(option => {
    if (!option || typeof option !== 'object') throw Error('Variação inválida.');
    const id = String(option.id || ''), nome = String(option.nome || '').trim();
    if (!/^v_[a-zA-Z0-9_-]{8,64}$/.test(id) || ids.has(id)) throw Error('Identificador de variação inválido ou repetido.');
    if (!nome || nome.length > 80 || names.has(catalogNameKey(nome))) throw Error('Dê um nome diferente a cada variação (até 80 caracteres).');
    const preco = option.preco === null || option.preco === undefined || option.preco === '' ? null : Number(option.preco);
    if (preco !== null && (!Number.isFinite(preco) || preco <= 0 || preco > 100000 || Math.abs(preco * 100 - Math.round(preco * 100)) > 0.00001)) throw Error('O preço da variação deve ser maior que zero, com até duas casas decimais.');
    const imagem_url = String(option.imagem_url || '').trim();
    if (imagem_url && (imagem_url.length > 2048 || !/^https:\/\/[^\s]+$/i.test(imagem_url))) throw Error('Use uma foto HTTPS válida na variação.');
    if (typeof option.disponivel !== 'boolean') throw Error('Informe a disponibilidade da variação.');
    ids.add(id); names.add(catalogNameKey(nome));
    return {id, nome, preco, imagem_url, disponivel: option.disponivel};
  });
  return {titulo, opcoes, revisao: String(input.revisao || '')};
}

function selectVariation(product, variationId) {
  const config = product.variacoes || emptyVariations();
  const id = String(variationId || '');
  if (!config.opcoes.length) {
    if (id) throw Error('Esta variação mudou. Remova o item do carrinho e escolha novamente.');
    return null;
  }
  const option = config.opcoes.find(value => value.id === id);
  if (!option || !option.disponivel) throw Error('Escolha uma variação disponível de ' + String(product.nome || 'seu produto') + '.');
  return {...option, titulo: config.titulo};
}

function normalizeCategories(value) {
  if (!value || !Array.isArray(value.nomes) || !Array.isArray(value.excluidas) || value.nomes.length > 60 || value.excluidas.length > 120) throw Error('Cadastro de categorias inválido.');
  const clean = list => {
    const result = [], keys = new Set();
    for (const item of list) {
      if (typeof item !== 'string' || !item.trim() || item.length > 55 || /[\[\];,\r\n]/.test(item) || catalogNameKey(item) === 'todos') throw Error('Use nomes de categoria de até 55 caracteres, sem colchetes ou separadores.');
      const key = catalogNameKey(item);
      if (keys.has(key)) throw Error('Há categorias repetidas.');
      keys.add(key); result.push(item.trim());
    }
    return result;
  };
  const nomes = clean(value.nomes), excluidas = clean(value.excluidas);
  if (nomes.some(name => excluidas.some(removed => catalogNameKey(removed) === catalogNameKey(name)))) throw Error('Categoria ativa e excluída ao mesmo tempo.');
  return {nomes, excluidas, revisao: String(value.revisao || '')};
}

function catalogCategories(products, stored) {
  const value = stored ? normalizeCategories(stored) : {nomes: DEFAULT_CATEGORIES, excluidas: [], revisao: ''};
  const nomes = [...value.nomes], seen = new Set(nomes.map(catalogNameKey)), removed = new Set(value.excluidas.map(catalogNameKey));
  for (const product of products) {
    const match = String(product.descricao || '').match(/\[\[MIMBOX_CATEGORIA:([^;\]\r\n]*)/i);
    const name = match?.[1]?.trim(), key = catalogNameKey(name);
    if (name && !seen.has(key) && !removed.has(key)) {nomes.push(name); seen.add(key);}
  }
  return {...value, nomes};
}

const cartLineKey = item => String(item.id) + '::' + String(item.variacao_id || '');

// Somente servidor: usa a tabela de configurações já existente; sem migrações.
async function readCatalogSettings(base, secret, ids) {
  const keys = [CATEGORIES_KEY, ...[...new Set(ids.map(String))].filter(id => /^[0-9a-f-]{36}$/i.test(id)).map(id => VARIATIONS_PREFIX + id.toLowerCase())];
  const rows = [];
  for (let offset = 0; offset < keys.length; offset += 35) {
    const response = await fetch(base + '/rest/v1/configuracoes_loja?select=chave,valor&chave=in.(' + keys.slice(offset, offset + 35).join(',') + ')&limit=35', {headers: {apikey: secret, Authorization: 'Bearer ' + secret}, cache: 'no-store'});
    if (!response.ok) throw Error('Não foi possível conferir as variações. Tente novamente.');
    const data = await response.json();
    if (!Array.isArray(data)) throw Error('Configuração de catálogo inválida.');
    rows.push(...data);
  }
  const variants = new Map(); let categories = null;
  for (const row of rows) {
    if (row.chave === CATEGORIES_KEY) categories = normalizeCategories(row.valor);
    else if (String(row.chave).startsWith(VARIATIONS_PREFIX)) variants.set(row.chave.slice(VARIATIONS_PREFIX.length), normalizeVariations(row.valor));
  }
  return {variants, categories};
}

function attachVariations(products, settings) {
  return products.map(product => ({...product, variacoes: settings.variants.get(String(product.id).toLowerCase()) || emptyVariations()}));
}

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
      const settings = await readCatalogSettings(base, key, ids);
      const products = attachVariations(await catalog.json(), settings);
      let priced;
      try {
        priced = priceCupCart(supplied, products);
        const seen = new Set();
        for (const item of priced.items) {
          const product = products.find(p => String(p.id).toLowerCase() === String(item.id).toLowerCase());
          const variation = selectVariation(product, item.variacao_id);
          const line = cartLineKey(item);
          if (seen.has(line)) throw Error('Itens repetidos no carrinho.');
          seen.add(line);
          if (variation?.preco != null) item.price = variation.preco;
        }
      } catch(error) { return res.status(400).json({error:error.message}); }
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
