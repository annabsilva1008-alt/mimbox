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


const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;

const headers = () => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json"
});

const clean = (v, max = 500) =>
  String(v ?? "").trim().slice(0, max);

const enc = v => encodeURIComponent(String(v));

const MAX_IMAGE_BYTES = 2500000;

const IMAGE_TYPES = {
  "image/jpeg": {
    ext: "jpg",
    magic: b => b.length >= 3 &&
      b[0] === 255 && b[1] === 216 && b[2] === 255
  },
  "image/png": {
    ext: "png",
    magic: b => b.length >= 8 &&
      b.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      )
  },
  "image/webp": {
    ext: "webp",
    magic: b => b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
  }
};

async function db(table, method = "GET", query = "", body) {
  const response = await fetch(
    `${base}/rest/v1/${table}${query}`,
    {
      method,
      headers: {
        ...headers(),
        Prefer: table === "configuracoes_loja" && method === "POST" ? "return=representation,resolution=merge-duplicates" : "return=representation"
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) })
    }
  );

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  if (!response.ok) {
    throw new Error(
      data && typeof data === "object"
        ? data.message || data.details || "Erro Supabase"
        : String(data)
    );
  }

  return data;
}

async function admin(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(s => s.trim())
    .find(s => s.startsWith("mimbox_admin_session="));

  const token = cookie
    ? decodeURIComponent(
        cookie.slice("mimbox_admin_session=".length)
      )
    : "";

  if (!token) return false;

  const response = await fetch(
    `${base}/auth/v1/user`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) return false;

  const user = await response.json();

  if (!user?.id) return false;

  const rows = await db(
    "administradores",
    "GET",
    `?usuario_id=eq.${enc(user.id)}&select=usuario_id&limit=1`
  );

  return rows.length > 0;
}

const statuses = [
  "aguardando",
  "em_preparacao",
  "pronto_retirada",
  "enviado",
  "entregue",
  "cancelado"
];

const goodId = id =>
  /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(
    String(id || "")
  );

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  if (!base || !key) {
    return res.status(503).json({
      erro: "Supabase não configurado"
    });
  }

  try {
    if (!(await admin(req))) {
      return res.status(401).json({
        erro: "Sessão administrativa inválida"
      });
    }

    const acao = req.method === "GET"
      ? req.query.acao
      : req.body?.acao;

    // CONSULTAS ADMINISTRATIVAS

    if (req.method === "GET") {
      if (acao === "produtos") {
        const products = await db("produtos", "GET", "?select=*&order=ordem.asc,nome.asc&limit=300");
        const settings = await readCatalogSettings(base, key, products.map(p => p.id));
        return res.json({produtos: attachVariations(products, settings), categorias: catalogCategories(products, settings.categories)});
      }

      if (acao === "clientes") {
        // Consulta pedidos sem relacionamento embutido.
        // Falhas na busca dos clientes não impedem
        // o carregamento do histórico de pedidos.

        const pedidos = await db(
          "pedidos",
          "GET",
          "?select=*&order=criado_em.desc&limit=500"
        );

        const ids = [
          ...new Set(
            pedidos
              .map(p => p.cliente_id)
              .filter(Boolean)
          )
        ];

        if (ids.length) {
          try {
            const clientes = await db(
              "clientes",
              "GET",
              `?select=*&id=in.(${ids.map(enc).join(",")})&limit=500`
            );

            const porId = new Map(
              clientes.map(c => [String(c.id), c])
            );

            for (const pedido of pedidos) {
              pedido.clientes =
                porId.get(String(pedido.cliente_id)) || null;
            }
          } catch (erroClientes) {
            console.error(
              "Clientes associados indisponíveis:",
              erroClientes
            );

            for (const pedido of pedidos) {
              pedido.clientes = null;
            }
          }
        }

        return res.json({ pedidos });
      }

      if (acao === "estoque") {
        return res.json({
          itens: await db(
            "estoque_mimbox",
            "GET",
            "?select=*&order=ordem.asc,nome.asc&limit=300"
          )
        });
      }

      if (acao === "envios") {
        const pedidos = await db(
          "pedidos",
          "GET",
          "?select=id,numero_pedido,forma_entrega,status_entrega,transportadora,observacoes,endereco_entrega,clientes(nome)&order=criado_em.desc&limit=200"
        );

        const meta = await db(
          "envios_mimbox",
          "GET",
          "?select=pedido_id,rastreio&limit=300"
        );

        const mapa = new Map(
          meta.map(x => [x.pedido_id, x])
        );

        return res.json({
          envios: pedidos.map(p => ({
            ...p,
            rastreio: mapa.get(p.id)?.rastreio || ""
          }))
        });
      }

      return res.status(400).json({
        erro: "Consulta desconhecida"
      });
    }

    // UPLOAD DE IMAGEM DOS PRODUTOS

    if (acao === "produto_imagem_upload") {
      const tipo = clean(req.body?.tipo, 50);
      const dados = req.body?.imagem_base64;
      const config = IMAGE_TYPES[tipo];

      if (
        !config ||
        typeof dados !== "string" ||
        !dados ||
        dados.length > 3400000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(dados)
      ) {
        return res.status(400).json({
          erro: "Envie JPG, PNG ou WebP com até 2,5 MB."
        });
      }

      const bytes = Buffer.from(dados, "base64");

      if (
        !bytes.length ||
        bytes.length > MAX_IMAGE_BYTES ||
        !config.magic(bytes)
      ) {
        return res.status(400).json({
          erro: "Imagem inválida ou maior que 2,5 MB."
        });
      }

      const { randomUUID } = await import("node:crypto");

      const caminho = `catalogo/${randomUUID()}.${config.ext}`;
      const bucket = "produtos-mimbox";

      const uploaded = await fetch(
        `${base}/storage/v1/object/${bucket}/${caminho}`,
        {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": tipo,
            "Cache-Control": "public, max-age=3600",
            "x-upsert": "false"
          },
          body: bytes
        }
      );

      if (!uploaded.ok) {
        const erro = await uploaded.text();

        console.error(
          "Storage upload:",
          uploaded.status,
          erro
        );

        return res.status(502).json({
          erro: "Não foi possível enviar a foto ao Storage."
        });
      }

      return res.json({
        ok: true,
        imagem_url:
          `${base}/storage/v1/object/public/${bucket}/${caminho}`
      });
    }

    if (acao === "categorias_salvar") {
      let categories;
      try { categories = normalizeCategories(req.body?.categorias); }
      catch (error) { return res.status(400).json({erro: error.message}); }
      const settings = await readCatalogSettings(base, key, []);
      if ((settings.categories?.revisao || "") !== categories.revisao) return res.status(409).json({erro: "As categorias mudaram em outra sessão. Recarregue o painel antes de salvar."});
      categories.revisao = crypto.randomUUID();
      await db("configuracoes_loja", "POST", "?on_conflict=chave", {chave: CATEGORIES_KEY, valor: categories});
      return res.json({ok: true, categorias: categories});
    }

    // GALERIA DE PRODUTOS

    if (acao === "produto_galeria_salvar") {
      const id = req.body?.id;
      const imagens = req.body?.imagens;

      if (
        !goodId(id) ||
        !Array.isArray(imagens) ||
        imagens.length > 8 ||
        imagens.some(url =>
          typeof url !== "string" ||
          url.length > 2048 ||
          !/^https:\/\/[^\s]+$/i.test(url)
        ) ||
        new Set(imagens).size !== imagens.length
      ) {
        return res.status(400).json({
          erro: "Galeria inválida. Use até 8 URLs HTTPS diferentes."
        });
      }

      const rows = await db(
        "produtos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        {
          imagens,
          imagem_url: imagens[0] || ""
        }
      );

      if (!rows.length) {
        return res.status(404).json({
          erro: "Produto não encontrado"
        });
      }

      return res.json({
        ok: true,
        produto: rows[0]
      });
    }

    // OCULTAR PRODUTO

    if (acao === "produto_ocultar") {
      const id = req.body?.id;

      if (!goodId(id)) {
        return res.status(400).json({
          erro: "Produto inválido"
        });
      }

      const rows = await db(
        "produtos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        { disponivel: false }
      );

      return res.json({
        ok: rows.length > 0
      });
    }

    // EXCLUIR PRODUTO

    if (acao === "produto_excluir") {
      const id = req.body?.id;

      if (!goodId(id)) {
        return res.status(400).json({
          erro: "Produto inválido"
        });
      }

      const rows = await db(
        "produtos",
        "DELETE",
        `?id=eq.${enc(id)}`
      );

      return res.json({
        ok: rows.length > 0
      });
    }

    // ORDEM DOS PRODUTOS

    if (acao === "produto_ordem") {
      const id = req.body?.id;
      const ordem = Number(req.body?.ordem);

      if (
        !goodId(id) ||
        !Number.isSafeInteger(ordem) ||
        ordem < 0 ||
        ordem > 10000
      ) {
        return res.status(400).json({
          erro: "Ordem inválida"
        });
      }

      const rows = await db(
        "produtos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        { ordem }
      );

      return res.json({
        ok: rows.length > 0
      });
    }

    // EDITAR PRODUTO

    if (acao === "produto_editar") {
      const id = req.body?.id;
      const p = req.body?.produto || {};

      if (
        !goodId(id) ||
        !clean(p.nome, 150) ||
        !Number.isFinite(Number(p.preco)) ||
        Number(p.preco) < 0
      ) {
        return res.status(400).json({
          erro: "Produto inválido"
        });
      }

      let variations;
      let activateAfterVariations = false;
      if (p.variacoes !== undefined) {
        try { variations = normalizeVariations(p.variacoes); if(variations.opcoes.length && Number(p.preco)<=0)throw Error("Informe um preço padrão maior que zero para o produto."); }
        catch (error) { return res.status(400).json({erro: error.message}); }
        const settings = await readCatalogSettings(base, key, [id]);
        if ((settings.variants.get(String(id).toLowerCase())?.revisao || "") !== variations.revisao) return res.status(409).json({erro: "As variações mudaram em outra sessão. Recarregue o produto antes de salvar."});
        activateAfterVariations = variations.opcoes.length > 0 && !(settings.variants.get(String(id).toLowerCase())?.opcoes.length) && !!p.disponivel;
        variations.revisao = crypto.randomUUID();
      }

      const produto = {
        nome: clean(p.nome, 150),
        colecao: clean(p.colecao, 100),
        preco: Number(p.preco),
        descricao: clean(p.descricao, 2000),
        imagem_url: clean(p.imagem_url, 2048),
        disponivel: activateAfterVariations ? false : !!p.disponivel,
        destaque: !!p.destaque,
        ...(p.ordem !== undefined &&
          Number.isSafeInteger(Number(p.ordem)) &&
          Number(p.ordem) >= 0 &&
          Number(p.ordem) <= 10000
          ? { ordem: Number(p.ordem) }
          : {})
      };

      const rows = await db(
        "produtos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        produto
      );

      if (!rows.length) return res.status(404).json({erro: "Produto não encontrado"});
      if (variations) {
        try { await db("configuracoes_loja", "POST", "?on_conflict=chave", {chave: VARIATIONS_PREFIX + String(id).toLowerCase(), valor: variations}); }
        catch { return res.status(503).json({erro: "Os dados do produto foram salvos, mas as variações não. Mantenha esta tela aberta e tente salvar novamente."}); }
      }
      if (activateAfterVariations) await db("produtos", "PATCH", `?id=eq.${enc(id)}`, {disponivel: true});
      return res.json({ok: true});
    }

    // CRIAR ITEM DE ESTOQUE

    if (acao === "estoque_criar") {
      const x = req.body?.item || {};
      const quantidade = Number(x.quantidade);
      const minimo = Number(x.minimo);

      if (
        !clean(x.nome, 150) ||
        !Number.isSafeInteger(quantidade) ||
        quantidade < 0 ||
        !Number.isSafeInteger(minimo) ||
        minimo < 0
      ) {
        return res.status(400).json({
          erro: "Estoque inválido"
        });
      }

      const rows = await db(
        "estoque_mimbox",
        "POST",
        "",
        {
          nome: clean(x.nome, 150),
          quantidade,
          minimo,
          unidade: clean(x.unidade, 20) || "un"
        }
      );

      return res.status(201).json({
        item: rows[0]
      });
    }

    // EDITAR ESTOQUE

    if (acao === "estoque_editar") {
      const { id } = req.body || {};
      const quantidade = Number(req.body?.quantidade);
      const minimo = Number(req.body?.minimo);

      if (
        !goodId(id) ||
        !Number.isSafeInteger(quantidade) ||
        quantidade < 0 ||
        !Number.isSafeInteger(minimo) ||
        minimo < 0
      ) {
        return res.status(400).json({
          erro: "Estoque inválido"
        });
      }

      const rows = await db(
        "estoque_mimbox",
        "PATCH",
        `?id=eq.${enc(id)}`,
        { quantidade, minimo }
      );

      return res.json({
        ok: rows.length > 0
      });
    }

    // EDITAR ENVIO

    if (acao === "envio_editar") {
      const { id } = req.body || {};
      const x = req.body?.envio || {};

      if (
        !goodId(id) ||
        !statuses.includes(x.status_entrega)
      ) {
        return res.status(400).json({
          erro: "Envio inválido"
        });
      }

      const current = await db(
        "pedidos",
        "GET",
        `?id=eq.${enc(id)}&select=id,observacoes&limit=1`
      );

      if (!current.length) {
        return res.status(404).json({
          erro: "Pedido não encontrado"
        });
      }

      const previousTag = String(
        current[0].observacoes || ""
      ).match(
        /\[MIMBOX_CLUBE:\{[^\]\r\n]*\}\]/
      )?.[0] || "";

      let notes = clean(x.observacoes, 3000);

      if (
        previousTag &&
        !notes.includes("[MIMBOX_CLUBE:") &&
        !notes.includes("[MIMBOX_TIPO:avulso]")
      ) {
        notes = (notes ? notes + "\n" : "") + previousTag;
      }

      if (notes.length > 1000) {
        return res.status(400).json({
          erro: "Observações muito longas"
        });
      }

      const pedidos = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        {
          status_entrega: x.status_entrega,
          transportadora: clean(x.transportadora, 150),
          observacoes: notes
        }
      );

      if (!pedidos.length) {
        return res.status(404).json({
          erro: "Pedido não encontrado"
        });
      }

      const existing = await db(
        "envios_mimbox",
        "GET",
        `?pedido_id=eq.${enc(id)}&select=pedido_id&limit=1`
      );

      if (existing.length) {
        await db(
          "envios_mimbox",
          "PATCH",
          `?pedido_id=eq.${enc(id)}`,
          { rastreio: clean(x.rastreio, 150) }
        );
      } else {
        await db(
          "envios_mimbox",
          "POST",
          "",
          {
            pedido_id: id,
            rastreio: clean(x.rastreio, 150)
          }
        );
      }

      return res.json({ ok: true });
    }

    // AÇÕES DE ATENDIMENTO DOS PEDIDOS

    if (acao === "pedido_atendimento") {
      const id = req.body?.id;
      const tipo = clean(req.body?.tipo, 30);

      if (
        !goodId(id) ||
        !["enviar", "retirar", "cancelar"].includes(tipo)
      ) {
        return res.status(400).json({
          erro: "Operação inválida"
        });
      }

      const pedidos = await db(
        "pedidos",
        "GET",
        `?id=eq.${enc(id)}&select=id,status_pagamento,status_entrega,forma_entrega,observacoes&limit=1`
      );

      const pedido = pedidos[0];

      if (!pedido) {
        return res.status(404).json({
          erro: "Pedido não encontrado"
        });
      }

      if (
        !["pago", "paid", "aprovado", "approved"].includes(
          String(pedido.status_pagamento || "").toLowerCase()
        )
      ) {
        return res.status(409).json({
          erro: "Pedido sem pagamento confirmado"
        });
      }

      if (
        ["cancelado", "entregue"].includes(
          pedido.status_entrega
        )
      ) {
        return res.status(409).json({
          erro: "Pedido já encerrado"
        });
      }

      if (
        String(pedido.observacoes || "")
          .includes("[MIMBOX_CLUBE:")
      ) {
        return res.status(409).json({
          erro: "Pedidos do Clube devem ser gerenciados em Entregas pendentes, caixa por caixa"
        });
      }

      if (
        tipo === "enviar" &&
        pedido.forma_entrega === "retirada"
      ) {
        return res.status(400).json({
          erro: "Este pedido é para retirada"
        });
      }

      if (
        tipo === "retirar" &&
        pedido.forma_entrega !== "retirada"
      ) {
        return res.status(400).json({
          erro: "Este pedido é para entrega"
        });
      }

      const status_entrega =
        tipo === "cancelar"
          ? "cancelado"
          : tipo === "enviar"
          ? "enviado"
          : "entregue";

      const rows = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        { status_entrega }
      );

      return res.json({
        ok: rows.length > 0
      });
    }

    // SALVAR OBSERVAÇÃO

    if (acao === "observacao_salvar") {
      const id = req.body?.id;
      const nova = clean(req.body?.texto, 650);

      if (!goodId(id) || !nova) {
        return res.status(400).json({
          erro: "Informe uma observação válida"
        });
      }

      const pedidos = await db(
        "pedidos",
        "GET",
        `?id=eq.${enc(id)}&select=id,observacoes&limit=1`
      );

      if (!pedidos.length) {
        return res.status(404).json({
          erro: "Pedido não encontrado"
        });
      }

      const atual = String(
        pedidos[0].observacoes || ""
      );

      const registro =
        `[${new Date().toISOString()
          .slice(0, 16)
          .replace("T", " ")} UTC] ${nova}`;

      const completo =
        (atual ? atual + "\n" : "") + registro;

      if (completo.length > 1000) {
        return res.status(409).json({
          erro: "Limite de observações deste pedido atingido. Resuma as anotações antigas antes de continuar."
        });
      }

      const rows = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        { observacoes: completo }
      );

      return res.json({
        ok: rows.length > 0
      });
    }

    // STATUS DO PEDIDO MANUAL

    if (acao === "pedido_status") {
      const id = req.body?.id;

      const status_entrega =
        clean(req.body?.status_entrega, 40);

      const status_pagamento =
        clean(req.body?.status_pagamento, 40);

      if (
        !goodId(id) ||
        !statuses.includes(status_entrega) ||
        !["pendente", "pago", "cancelado"].includes(
          status_pagamento
        )
      ) {
        return res.status(400).json({
          erro: "Status de pedido inválido"
        });
      }

      const existing = await db(
        "pedidos",
        "GET",
        `?id=eq.${enc(id)}&select=id,numero_pedido,status_pagamento&limit=1`
      );

      if (!existing.length) {
        return res.status(404).json({
          erro: "Pedido não encontrado"
        });
      }

      if (
        !String(existing[0].numero_pedido || "")
          .startsWith("MANUAL-")
      ) {
        return res.status(403).json({
          erro: "Edite apenas pedidos manuais nesta tela"
        });
      }

      const rows = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        {
          status_entrega,
          status_pagamento
        }
      );

      return res.json({
        ok: rows.length > 0
      });
    }

    // CADASTRAR PEDIDO MANUAL

    if (acao === "pedido_manual") {
      const c = req.body?.cliente || {};
      const p = req.body?.pedido || {};

      const total = Number(p.valor_total);
      const quantidade = Number(p.quantidade);

      if (
        clean(c.nome, 150).length < 2 ||
        !/^\S+@\S+\.\S+$/.test(
          clean(c.email, 254)
        ) ||
        !clean(p.descricao, 250) ||
        !Number.isFinite(total) ||
        total < 0 ||
        !Number.isSafeInteger(quantidade) ||
        quantidade < 1 ||
        !["retirada", "transportadora"].includes(
          p.forma_entrega
        )
      ) {
        return res.status(400).json({
          erro: "Dados do pedido inválidos"
        });
      }

      const clientes = await db(
        "clientes",
        "POST",
        "",
        {
          nome: clean(c.nome, 150),
          email: clean(c.email, 254).toLowerCase(),
          telefone: clean(c.telefone, 30)
        }
      );

      const cliente_id = clientes[0]?.id;

      if (!cliente_id) {
        throw new Error(
          "Não foi possível cadastrar cliente"
        );
      }

      const codigo =
        `MANUAL-${Date.now()}-${Math.floor(
          Math.random() * 10000
        )}`;

      const pedidos = await db(
        "pedidos",
        "POST",
        "",
        {
          numero_pedido: codigo,
          cliente_id,
          valor_total: total,
          forma_entrega: p.forma_entrega,
          status_pagamento: "pendente",
          status_entrega: "aguardando",
          itens: [{
            descricao: clean(
              p.descricao, 250
            ),
            quantidade
          }],
          observacoes: (
            clean(p.observacoes, 900) +
            "\n[MIMBOX_TIPO:" +
            (p.tipo_pedido === "clube" ? "clube" : "avulso") +
            "]"
          ).trim()
        }
      );

      return res.status(201).json({
        ok: true,
        pedido: pedidos[0]
      });
    }

    return res.status(400).json({
      erro: "Ação desconhecida"
    });

  } catch (err) {
    console.error("admin-operacoes", err);

    return res.status(500).json({
      erro: "Falha na operação: " + err.message
    });
  }
}
