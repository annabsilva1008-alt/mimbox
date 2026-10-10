
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    return res.status(503).json({
      erro: "Login ainda não configurado"
    });
  }

  const { email, senha } = req.body || {};

  if (
    typeof email !== "string" ||
    typeof senha !== "string" ||
    !email.includes("@") ||
    senha.length === 0 ||
    email.length > 254 ||
    senha.length > 1024
  ) {
    return res.status(400).json({
      erro: "Informe e-mail e senha válidos"
    });
  }

  try {
    const base = url.replace(/\/$/, "");

    const resposta = await fetch(
      `${base}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: secret
        },
        body: JSON.stringify({
          email,
          password: senha
        })
      }
    );

    if (!resposta.ok) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos"
      });
    }

    const sessao = await resposta.json();

    const usuarioResposta = await fetch(
      `${base}/auth/v1/user`,
      {
        headers: {
          apikey: secret,
          Authorization: `Bearer ${sessao.access_token}`
        }
      }
    );

    if (!usuarioResposta.ok) {
      return res.status(401).json({
        erro: "Não foi possível validar o usuário"
      });
    }

    const usuario = await usuarioResposta.json();

    const adminResposta = await fetch(
      `${base}/rest/v1/administradores?usuario_id=eq.${usuario.id}&select=usuario_id`,
      {
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`
        }
      }
    );

    if (!adminResposta.ok) {
      return res.status(503).json({
        erro: "Não foi possível verificar a permissão"
      });
    }

    const administradores = await adminResposta.json();

    if (!Array.isArray(administradores) ||
        administradores.length !== 1) {
      return res.status(403).json({
        erro: "Usuário sem permissão administrativa"
      });
    }

    return res.status(200).json({
      status: "autenticado",
      mensagem: "Login administrativo validado"
    });

  } catch {
    return res.status(503).json({
      erro: "Serviço temporariamente indisponível"
    });
  }
}
