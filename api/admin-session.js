
const COOKIE_NAME = "mimbox_admin_session";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!base || !secret) {
    return res.status(503).json({
      autenticado: false,
      erro: "Configuração incompleta"
    });
  }

  const cookies = Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const pos = item.indexOf("=");
        return [
          item.slice(0, pos),
          item.slice(pos + 1)
        ];
      })
  );

  const token = cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      autenticado: false
    });
  }

  try {
    const resposta = await fetch(
      `${base}/auth/v1/user`,
      {
        headers: {
          apikey: secret,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!resposta.ok) {
      return res.status(401).json({
        autenticado: false
      });
    }

    const usuario = await resposta.json();

    if (!usuario.id) {
      return res.status(401).json({
        autenticado: false
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
        autenticado: false,
        erro: "Falha ao verificar permissões"
      });
    }

    const administradores = await adminResposta.json();

    if (
      !Array.isArray(administradores) ||
      administradores.length !== 1
    ) {
      return res.status(403).json({
        autenticado: false
      });
    }

    return res.status(200).json({
      autenticado: true,
      mensagem: "Sessão administrativa válida"
    });

  } catch {
    return res.status(503).json({
      autenticado: false,
      erro: "Serviço temporariamente indisponível"
    });
  }
}
