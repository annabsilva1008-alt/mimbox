
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
  res.setHeader("X-Content-Type-Options", "nosniff");

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

  const publico =
    req.query?.publico === "1";

  if (publico) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=120"
    );
  } else {
    res.setHeader("Cache-Control", "no-store");
  }

  try {
    // O acesso administrativo continua protegido.
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
          }
        }
      );

      if (!usuarioResposta.ok) {
        return res.status(401).json({
          erro: "Sessão inválida ou expirada"
        });
      }

      const usuario = await usuarioResposta.json();

      if (!usuario.id) {
        return res.status(401).json({
          erro: "Usuário inválido"
        });
      }

      const adminResposta = await fetch(
        `${base}/rest/v1/administradores?usuario_id=eq.${encodeURIComponent(usuario.id)}&select=usuario_id`,
        {
          headers: {
            apikey: secret,
            Accept: "application/json"
          }
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

    // Campos que podem ser mostrados na loja.
    const campos =
      "id,nome,descricao,colecao,preco," +
      "imagem_url,disponivel,destaque,ordem";

    const consulta =
      `${base}/rest/v1/produtos` +
      `?select=${campos}` +
      `&order=ordem.asc,criado_em.asc` +
      `&limit=200`;

    const produtosResposta = await fetch(
      consulta,
      {
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          Accept: "application/json"
        }
      }
    );

    if (!produtosResposta.ok) {
      console.error(
        "Erro ao consultar produtos:",
        produtosResposta.status
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

    return res.status(200).json({
      sucesso: true,
      produtos
    });

  } catch (erro) {
    console.error("admin-produtos:", erro);

    return res.status(503).json({
      erro: "Serviço temporariamente indisponível"
    });
  }
}
