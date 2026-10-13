
const base = (process.env.SUPABASE_URL || "")
  .replace(/\/$/, "");

const key = process.env.SUPABASE_SECRET_KEY;

const headers = () => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json"
});

const clean = (v, max = 500) =>
  String(v ?? "").trim().slice(0, max);

const enc = v => encodeURIComponent(String(v));

async function db(table, method = "GET", query = "", body) {
  const r = await fetch(
    `${base}/rest/v1/${table}${query}`,
    {
      method,
      headers: {
        ...headers(),
        Prefer: "return=representation"
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) })
    }
  );

  const raw = await r.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  if (!r.ok) {
    throw Error(
      typeof data === "object"
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

  const r = await fetch(
    `${base}/auth/v1/user`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!r.ok) return false;

  const user = await r.json();
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

    if (req.method === "GET") {
      if (acao === "produtos") {
        return res.json({
          produtos: await db(
            "produtos",
            "GET",
            "?select=*&order=nome.asc&limit=300"
          )
        });
      }

      if (acao === "clientes") {
        const pedidos = await db(
          "pedidos", "GET",
          "?select=id,numero_pedido,cliente_id,criado_em,valor_total,status_pagamento,status_entrega,forma_entrega,observacoes,itens,clientes(nome,email,telefone)&order=criado_em.desc&limit=500"
        );
        return res.json({ pedidos });
      }

      if (acao === "estoque") {
        return res.json({
          itens: await db(
            "estoque_mimbox",
            "GET",
            "?select=*&order=nome.asc&limit=300"
          )
        });
      }

      if (acao === "envios") {
        const pedidos = await db(
          "pedidos",
          "GET",
          "?select=id,numero_pedido,forma_entrega,status_entrega,transportadora,observacoes,clientes(nome)&order=criado_em.desc&limit=200"
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

      const produto = {
        nome: clean(p.nome, 150),
        colecao: clean(p.colecao, 100),
        preco: Number(p.preco),
        descricao: clean(p.descricao, 2000),
        imagem_url: clean(p.imagem_url, 2048),
        disponivel: !!p.disponivel,
        destaque: !!p.destaque
      };

      const rows = await db(
        "produtos",
        "PATCH",
        `?id=eq.${enc(id)}`,
        produto
      );

      return res.json({ ok: rows.length > 0 });
    }

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

      return res.json({ ok: rows.length > 0 });
    }

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

      const current = await db("pedidos", "GET",
        `?id=eq.${enc(id)}&select=id,observacoes&limit=1`);

      if (!current.length) {
        return res.status(404).json({
          erro: "Pedido não encontrado"
        });
      }

      const previousTag = String(current[0].observacoes || "")
        .match(/\[MIMBOX_CLUBE:\{[^\]\r\n]*\}\]/)?.[0] || "";

      let notes = clean(x.observacoes, 3000);

      if (previousTag && !notes.includes("[MIMBOX_CLUBE:")) {
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

    if (acao === "pedido_atendimento") {
      const id = req.body?.id;
      const tipo = clean(req.body?.tipo, 30);

      if (!goodId(id) ||
          !["enviar", "retirar", "cancelar"].includes(tipo)) {
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

      if (!["pago", "paid", "aprovado", "approved"].includes(
        String(pedido.status_pagamento || "").toLowerCase()
      )) {
        return res.status(409).json({
          erro: "Pedido sem pagamento confirmado"
        });
      }

      if (["cancelado", "entregue"].includes(
        pedido.status_entrega
      )) {
        return res.status(409).json({
          erro: "Pedido já encerrado"
        });
      }

      if (String(pedido.observacoes || "")
        .includes("[MIMBOX_CLUBE:")) {
        return res.status(409).json({
          erro: "Pedidos do Clube devem ser gerenciados em Entregas pendentes, caixa por caixa"
        });
      }

      if (tipo === "enviar" &&
          pedido.forma_entrega === "retirada") {
        return res.status(400).json({
          erro: "Este pedido é para retirada"
        });
      }

      if (tipo === "retirar" &&
          pedido.forma_entrega !== "retirada") {
        return res.status(400).json({
          erro: "Este pedido é para entrega"
        });
      }

      const status_entrega =
        tipo === "cancelar" ? "cancelado"
        : tipo === "enviar" ? "enviado"
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
          .slice(0,16)
          .replace("T"," ")} UTC] ${nova}`;

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

      // Pedidos da InfinitePay não têm pagamento
      // alterado manualmente nesta tela.
      if (!String(existing[0].numero_pedido || "")
        .startsWith("MANUAL-")) {
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
        throw Error(
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
          observacoes: clean(
            p.observacoes, 1000
          )
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
    console.error(
      "admin-operacoes", err
    );

    return res.status(500).json({
      erro: "Falha na operação: " + err.message
    });
  }
}
