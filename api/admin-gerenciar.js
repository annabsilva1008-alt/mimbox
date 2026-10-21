
const BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY;

const SITE_KEY = "site_editor_v1";

const SITE_DEFAULTS = {
  hero_titulo: "Presentes com personalidade.",
  hero_subtitulo: "Coleções criativas e personalizados para deixar sua marca.",
  hero_imagem: "",
  hero_botao_texto: "Conheça as coleções",
  hero_botao_link: "/#colecoes",

  seo_titulo: "Mimbox | Copos personalizados, brindes e coleções criativas",
  seo_descricao: "Copos personalizados, brindes empresariais e coleções criativas. Conheça a Mimbox e peça seu orçamento.",
  whatsapp: "",
  instagram: "",
  aviso: "",

  inicio_personalizados_imagem: "",
  inicio_loja_imagem: "",
  inicio_negocios_imagem: "",

  personalizados_titulo: "",
  personalizados_subtitulo: "",
  personalizados_banner_imagem: "",
  personalizados_copos_imagem: "",
  personalizados_pratos_imagem: "",
  personalizados_brindes_imagem: "",

  loja_titulo: "",
  loja_subtitulo: "",
  loja_banner_imagem: "",
  loja_botao_texto: "",
  loja_botao_link: "",
  loja_colecoes_imagem: "",
  loja_destaque_imagem: "",

  negocios_titulo: "",
  negocios_subtitulo: "",
  negocios_banner_imagem: "",
  negocios_brindes_imagem: "",
  negocios_personalizados_imagem: "",
  negocios_botao_texto: "",
  negocios_botao_link: "",

  sobre_titulo: "",
  sobre_texto: "",
  sobre_banner_imagem: "",
  sobre_ana_imagem: "",
  sobre_rafa_imagem: "",

  blog_titulo: "",
  blog_subtitulo: "",
  blog_banner_imagem: ""
};

const SITE_LIMITS = {
  hero_titulo: 100,
  hero_subtitulo: 240,
  hero_imagem: 2048,
  hero_botao_texto: 55,
  hero_botao_link: 500,

  seo_titulo: 70,
  seo_descricao: 180,
  whatsapp: 25,
  instagram: 200,
  aviso: 240,

  inicio_personalizados_imagem: 2048,
  inicio_loja_imagem: 2048,
  inicio_negocios_imagem: 2048,

  personalizados_titulo: 100,
  personalizados_subtitulo: 500,
  personalizados_banner_imagem: 2048,
  personalizados_copos_imagem: 2048,
  personalizados_pratos_imagem: 2048,
  personalizados_brindes_imagem: 2048,

  loja_titulo: 100,
  loja_subtitulo: 500,
  loja_banner_imagem: 2048,
  loja_botao_texto: 55,
  loja_botao_link: 500,
  loja_colecoes_imagem: 2048,
  loja_destaque_imagem: 2048,

  negocios_titulo: 100,
  negocios_subtitulo: 500,
  negocios_banner_imagem: 2048,
  negocios_brindes_imagem: 2048,
  negocios_personalizados_imagem: 2048,
  negocios_botao_texto: 55,
  negocios_botao_link: 500,

  sobre_titulo: 100,
  sobre_texto: 5000,
  sobre_banner_imagem: 2048,
  sobre_ana_imagem: 2048,
  sobre_rafa_imagem: 2048,

  blog_titulo: 100,
  blog_subtitulo: 500,
  blog_banner_imagem: 2048
};

const deliveryStatuses = [
  "aguardando",
  "em_preparacao",
  "pronto_retirada",
  "enviado",
  "entregue",
  "cancelado"
];

const headers = () => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json"
});

const json = (res, code, data) => res.status(code).json(data);

const str = (value, max = 500) =>
  String(value ?? "").trim().slice(0, max);

async function db(table, method = "GET", query = "", body) {
  const response = await fetch(
    `${BASE}/rest/v1/${table}${query}`,
    {
      method,
      headers: {
        ...headers(),
        Prefer:
          method === "POST" &&
          table === "configuracoes_loja"
            ? "return=representation,resolution=merge-duplicates"
            : "return=representation"
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
        ? data.message || data.details || "Erro no banco"
        : String(data)
    );
  }

  return data;
}

async function authorized(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(value => value.trim())
    .find(value =>
      value.startsWith("mimbox_admin_session=")
    );

  let token = "";

  if (cookie) {
    try {
      token = decodeURIComponent(
        cookie.slice("mimbox_admin_session=".length)
      );
    } catch {
      return false;
    }
  }

  if (!token) return false;

  const response = await fetch(
    `${BASE}/auth/v1/user`,
    {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) return false;

  const user = await response.json();

  if (!user?.id) return false;

  const admins = await db(
    "administradores",
    "GET",
    `?usuario_id=eq.${encodeURIComponent(user.id)}&select=usuario_id&limit=1`
  );

  return Array.isArray(admins) && admins.length > 0;
}

function validarConteudoSite(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new Error("Conteúdo inválido");
  }

  const output = {};

  for (const [campo, limite] of Object.entries(SITE_LIMITS)) {
    const valor = input[campo];

    if (valor !== undefined && typeof valor !== "string") {
      throw new Error("Campo inválido: " + campo);
    }

    output[campo] = String(
      valor ?? SITE_DEFAULTS[campo] ?? ""
    ).trim().slice(0, limite);
  }

  for (const [campo, valor] of Object.entries(output)) {
    if (
      campo.endsWith("_imagem") &&
      valor &&
      !/^https:\/\/[^\s]+$/i.test(valor)
    ) {
      throw new Error(
        "A imagem do campo " +
        campo +
        " precisa ter uma URL HTTPS"
      );
    }
  }

  if (
    output.instagram &&
    !/^https:\/\/[^\s]+$/i.test(output.instagram)
  ) {
    throw new Error("Instagram: informe uma URL HTTPS");
  }

  if (
    output.whatsapp &&
    !/^\d{10,15}$/.test(output.whatsapp)
  ) {
    throw new Error("WhatsApp inválido");
  }

  for (const campo of [
    "hero_botao_link",
    "loja_botao_link",
    "negocios_botao_link"
  ]) {
    const valor = output[campo];

    if (
      valor &&
      !/^(https:\/\/[^\s]+|\/(?!\/)[^\s]*|#[^\s]*)$/i.test(valor)
    ) {
      throw new Error("Link inválido: " + campo);
    }
  }

  return output;
}

async function lerConteudoSite() {
  const rows = await db(
    "configuracoes_loja",
    "GET",
    `?chave=eq.${SITE_KEY}&select=valor&limit=1`
  );

  if (!Array.isArray(rows)) {
    throw new Error("Resposta inválida ao consultar configurações do site");
  }

  const salvo =
    rows[0]?.valor &&
    typeof rows[0].valor === "object" &&
    !Array.isArray(rows[0].valor)
      ? rows[0].valor
      : {};

  const conteudo = {};

  for (const campo of Object.keys(SITE_DEFAULTS)) {
    conteudo[campo] =
      typeof salvo[campo] === "string"
        ? salvo[campo]
        : SITE_DEFAULTS[campo];
  }

  return conteudo;
}

// Upload de imagens na API existente
async function uploadImagemSite(req, res) {
  const campo = req.body?.campo;
  const imagem = req.body?.imagem;
  const limite = 700 * 1024;

  if (
    typeof campo !== "string" ||
    !campo.endsWith("_imagem") ||
    !Object.prototype.hasOwnProperty.call(
      SITE_DEFAULTS,
      campo
    )
  ) {
    return json(res, 400, {
      erro: "Campo de imagem inválido"
    });
  }

  if (
    typeof imagem !== "string" ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(imagem)
  ) {
    return json(res, 400, {
      erro: "Envie uma imagem WebP válida"
    });
  }

  const bytes = Buffer.from(
    imagem.slice("data:image/webp;base64,".length),
    "base64"
  );

  if (
    !bytes.length ||
    bytes.length > limite ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return json(res, 400, {
      erro: "Imagem inválida ou maior que 700 KB"
    });
  }

  const nome =
    `${campo}/${Date.now()}-${crypto.randomUUID()}.webp`;

  const response = await fetch(
    `${BASE}/storage/v1/object/mimbox-imagens/${nome}`,
    {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "image/webp",
        "x-upsert": "false",
        "Cache-Control": "31536000"
      },
      body: bytes
    }
  );

  if (!response.ok) {
    console.error(
      "Falha no Storage",
      response.status,
      await response.text()
    );

    return json(res, 502, {
      erro: "Falha ao enviar imagem ao Supabase"
    });
  }

  return json(res, 200, {
    ok: true,
    url:
      `${BASE}/storage/v1/object/public/` +
      `mimbox-imagens/${nome}`
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, {
      erro: "Método não permitido"
    });
  }

  if (!BASE || !KEY) {
    return json(res, 503, {
      erro: "Supabase não configurado"
    });
  }

  try {
    // Conteúdo público
    if (
      req.method === "GET" &&
      req.query.action === "site_publico"
    ) {
      const conteudo = await lerConteudoSite();

      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );

      return json(res, 200, {
        ok: true,
        conteudo
      });
    }

    // Autenticação obrigatória para as demais ações
    if (!(await authorized(req))) {
      return json(res, 401, {
        erro: "Acesso administrativo não autorizado"
      });
    }

    const action =
      req.method === "GET"
        ? req.query.action
        : req.body?.action;

    // Upload de imagem
    if (action === "upload_imagem") {
      if (req.method !== "POST") {
        return json(res, 405, {
          erro: "Use POST para upload"
        });
      }

      const origin = req.headers.origin;

      if (origin) {
        let originHost;

        try {
          originHost = new URL(origin).host;
        } catch {
          return json(res, 403, {
            erro: "Origem inválida"
          });
        }

        if (originHost !== req.headers.host) {
          return json(res, 403, {
            erro: "Origem não autorizada"
          });
        }
      }

      return uploadImagemSite(req, res);
    }

    // GERENCIAR CONTEÚDO DO SITE
    if (action === "site_conteudo") {
      if (req.method === "GET") {
        return json(res, 200, {
          ok: true,
          conteudo: await lerConteudoSite()
        });
      }

      const input = req.body?.conteudo;

      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
      ) {
        return json(res, 400, {
          erro: "Conteúdo inválido"
        });
      }

      const anterior = await lerConteudoSite();
      let conteudo;

      try {
        conteudo = validarConteudoSite({
          ...anterior,
          ...input
        });
      } catch (erro) {
        return json(res, 400, {
          erro: erro.message
        });
      }

      await db(
        "configuracoes_loja",
        "POST",
        "?on_conflict=chave",
        {
          chave: SITE_KEY,
          valor: conteudo
        }
      );

      return json(res, 200, {
        ok: true,
        conteudo
      });
    }

    // DASHBOARD
    if (action === "overview") {
      const [
        pedidos,
        produtos,
        clientes,
        config
      ] = await Promise.all([
        db(
          "pedidos",
          "GET",
          "?select=*,clientes(nome,telefone,email)&order=criado_em.desc&limit=200"
        ),
        db(
          "produtos",
          "GET",
          "?select=*&limit=200"
        ),
        db(
          "clientes",
          "GET",
          "?select=*&limit=200"
        ),
        db(
          "configuracoes_loja",
          "GET",
          "?chave=eq.principal&select=valor&limit=1"
        )
      ]);

      return json(res, 200, {
        pedidos,
        produtos,
        clientes,
        config: config[0]?.valor || {}
      });
    }

    // CONFIGURAÇÕES DA LOJA
    if (action === "config") {
      if (req.method !== "POST") {
        return json(res, 405, {
          erro: "Use POST para esta ação"
        });
      }

      const c = req.body?.config || {};

      const config = {
        retirada_ativa: !!c.retirada_ativa,
        retirada_local: str(c.retirada_local, 250),
        retirada_horarios: str(c.retirada_horarios, 300),
        retirada_instrucoes: str(c.retirada_instrucoes, 800),
        loja_aviso: str(c.loja_aviso, 300),
        whatsapp: str(c.whatsapp, 25),
        instagram: str(c.instagram, 200)
      };

      await db(
        "configuracoes_loja",
        "POST",
        "?on_conflict=chave",
        {
          chave: "principal",
          valor: config
        }
      );

      return json(res, 200, {
        ok: true,
        config
      });
    }

    // ALTERAR STATUS DO PEDIDO
    if (action === "pedido_status") {
      if (req.method !== "POST") {
        return json(res, 405, {
          erro: "Use POST para esta ação"
        });
      }

      const id = str(req.body?.id, 100);
      const status = str(
        req.body?.status_entrega,
        50
      );

      if (
        !id ||
        !deliveryStatuses.includes(status)
      ) {
        return json(res, 400, {
          erro: "Pedido ou status inválido"
        });
      }

      const result = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${encodeURIComponent(id)}&select=id,status_entrega`,
        {
          status_entrega: status
        }
      );

      if (!result.length) {
        return json(res, 404, {
          erro: "Pedido não encontrado"
        });
      }

      return json(res, 200, {
        ok: true,
        pedido: result[0]
      });
    }

    // OBSERVAÇÕES DO PEDIDO
    if (action === "pedido_nota") {
      if (req.method !== "POST") {
        return json(res, 405, {
          erro: "Use POST para esta ação"
        });
      }

      const id = str(req.body?.id, 100);
      const nota = str(req.body?.nota, 1000);

      if (!id) {
        return json(res, 400, {
          erro: "Pedido inválido"
        });
      }

      const result = await db(
        "pedidos",
        "PATCH",
        `?id=eq.${encodeURIComponent(id)}&select=id,observacoes`,
        {
          observacoes: nota
        }
      );

      if (!result.length) {
        return json(res, 404, {
          erro: "Pedido não encontrado"
        });
      }

      return json(res, 200, {
        ok: true
      });
    }

    // ATUALIZAR PRODUTO
    if (action === "produto") {
      if (req.method !== "POST") {
        return json(res, 405, {
          erro: "Use POST para esta ação"
        });
      }

      const p = req.body?.produto || {};
      const id = str(p.id, 100);
      const preco = Number(p.preco);

      if (!id) {
        return json(res, 400, {
          erro: "ID do produto obrigatório"
        });
      }

      if (
        !str(p.nome, 150) ||
        !Number.isFinite(preco) ||
        preco < 0
      ) {
        return json(res, 400, {
          erro: "Nome e preço válidos obrigatórios"
        });
      }

      const data = {
        nome: str(p.nome, 150),
        colecao: str(p.colecao, 100),
        preco,
        descricao: str(p.descricao, 2000),
        imagem_url: str(p.imagem_url, 2048),
        disponivel: !!p.disponivel,
        destaque: !!p.destaque
      };

      const result = await db(
        "produtos",
        "PATCH",
        `?id=eq.${encodeURIComponent(id)}&select=id`,
        data
      );

      if (!result.length) {
        return json(res, 404, {
          erro: "Produto não encontrado"
        });
      }

      return json(res, 200, {
        ok: true
      });
    }

    // CRIAR PEDIDO MANUAL
    if (action === "pedido_manual") {
      if (req.method !== "POST") {
        return json(res, 405, {
          erro: "Use POST para esta ação"
        });
      }

      const c = req.body?.cliente || {};
      const p = req.body?.pedido || {};

      const nome = str(c.nome, 150);
      const email = str(c.email, 254).toLowerCase();
      const telefone = str(c.telefone, 30);

      if (
        nome.length < 2 ||
        !/^\S+@\S+\.\S+$/.test(email)
      ) {
        return json(res, 400, {
          erro: "Nome e e-mail válidos são obrigatórios"
        });
      }

      const valor = Number(p.valor_total);

      if (
        !Number.isFinite(valor) ||
        valor < 0
      ) {
        return json(res, 400, {
          erro: "Valor inválido"
        });
      }

      const forma = [
        "retirada",
        "transportadora"
      ].includes(p.forma_entrega)
        ? p.forma_entrega
        : null;

      if (!forma) {
        return json(res, 400, {
          erro: "Forma de entrega inválida"
        });
      }

      const clientes = await db(
        "clientes",
        "POST",
        "?select=id",
        {
          nome,
          email,
          telefone
        }
      );

      const idCliente = clientes[0]?.id;

      if (!idCliente) {
        throw new Error(
          "Cliente não pôde ser criado"
        );
      }

      const codigo = `MANUAL-${Date.now()}`;

      const pedido = {
        numero_pedido: codigo,
        cliente_id: idCliente,
        valor_total: valor,
        forma_entrega: forma,
        status_pagamento: "pendente",
        status_entrega: "aguardando",
        itens: [
          {
            descricao: str(p.descricao, 200),
            quantidade: Math.max(
              1,
              Math.min(
                100,
                Number(p.quantidade) || 1
              )
            )
          }
        ]
      };

      const result = await db(
        "pedidos",
        "POST",
        "?select=id,numero_pedido",
        pedido
      );

      return json(res, 201, {
        ok: true,
        pedido: result[0]
      });
    }

    return json(res, 400, {
      erro: "Ação desconhecida"
    });

  } catch (erro) {
    console.error("admin-gerenciar", erro);

    return json(res, 500, {
      erro: erro.message || "Erro no servidor"
    });
  }
}
