
const COOKIE_NAME = "mimbox_admin_session";

function lerCookie(req) {
  const cookies = (req.headers.cookie || "")
    .split(";")
    .map(item => item.trim());

  const cookie = cookies.find(item =>
    item.startsWith(COOKIE_NAME + "=")
  );

  if (!cookie) return null;

  try {
    return decodeURIComponent(
      cookie.slice(COOKIE_NAME.length + 1)
    );
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );

  if (req.method !== "GET") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  const base = String(
    process.env.SUPABASE_URL || ""
  ).replace(/\/$/, "");

  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!base || !secret) {
    return res.status(503).json({
      erro: "Configuração incompleta"
    });
  }

  const publico = req.query?.publico === "1";

  try {
    // PROTEÇÃO DA CONSULTA ADMINISTRATIVA
    if (!publico) {
      const token = lerCookie(req);

      if (!token) {
        return res.status(401).json({
          erro: "Faça login no painel"
        });
      }

      const usuarioResposta = await fetch(
        `${base}/auth/v1/user`,
        {
          headers: {
            apikey: secret,
            Authorization: `Bearer ${token}`
          },
          cache: "no-store"
        }
      );

      if (!usuarioResposta.ok) {
        return res.status(401).json({
          erro: "Sessão inválida ou expirada"
        });
      }

      const usuario = await usuarioResposta.json();

      if (!usuario?.id) {
        return res.status(401).json({
          erro: "Usuário inválido"
        });
      }

      const adminResposta = await fetch(
        `${base}/rest/v1/administradores` +
        `?usuario_id=eq.${encodeURIComponent(usuario.id)}` +
        `&select=usuario_id&limit=1`,
        {
          headers: {
            apikey: secret,
            Authorization: `Bearer ${secret}`,
            Accept: "application/json"
          },
          cache: "no-store"
        }
      );

      if (!adminResposta.ok) {
        return res.status(503).json({
          erro: "Falha ao verificar permissões"
        });
      }

      const administradores =
        await adminResposta.json();

      if (
        !Array.isArray(administradores) ||
        administradores.length !== 1
      ) {
        return res.status(403).json({
          erro: "Acesso não autorizado"
        });
      }
    }

    // CAMPOS DO CATÁLOGO
    // Inclui a galeria de até 8 fotos.
    const campos = [
      "id",
      "nome",
      "descricao",
      "colecao",
      "preco",
      "imagem_url",
      "imagens",
      "disponivel",
      "destaque",
      "ordem"
    ].join(",");

    // A loja consulta somente produtos disponíveis.
    // O CRM consulta todos os produtos.
    const filtro = publico
      ? "&disponivel=eq.true"
      : "";

    const consulta =
      `${base}/rest/v1/produtos` +
      `?select=${campos}` +
      filtro +
      `&order=ordem.asc,nome.asc` +
      `&limit=200`;

    const produtosResposta = await fetch(
      consulta,
      {
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    if (!produtosResposta.ok) {
      const detalhe = await produtosResposta.text();

      console.error(
        "Erro ao consultar produtos:",
        produtosResposta.status,
        detalhe.slice(0, 500)
      );

      return res.status(503).json({
        erro: "Não foi possível consultar os produtos"
      });
    }

    const produtos = await produtosResposta.json();

    if (!Array.isArray(produtos)) {
      return res.status(503).json({
        erro: "Resposta inválida do catálogo"
      });
    }

    // NORMALIZAÇÃO DAS IMAGENS
    const catalogo = produtos.map(produto => {
      const imagens = Array.isArray(produto.imagens)
        ? produto.imagens.filter(
            url =>
              typeof url === "string" &&
              /^https:\/\//i.test(url)
          ).slice(0, 8)
        : [];

      const principal =
        typeof produto.imagem_url === "string"
          ? produto.imagem_url.trim()
          : "";

      // Produtos antigos podem ter somente imagem_url.
      if (imagens.length === 0 && principal) {
        imagens.push(principal);
      }

      return {
        ...produto,
        imagem_url: imagens[0] || principal,
        imagens
      };
    });

    const cup = product => /^Personalizados — Copos — /.test(String(product.colecao || ''));
    const visible = publico ? (req.query?.personalizados === 'copos' ? catalogo.filter(cup) : catalogo.filter(p => !cup(p))) : catalogo;
    return res.status(200).json({
      sucesso: true,
      produtos: visible
    });

  } catch (erro) {
    console.error("admin-produtos:", erro);

    return res.status(503).json({
      erro: "Serviço temporariamente indisponível"
    });
  }
}
