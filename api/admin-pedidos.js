
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!base || !key) {
    return res.status(503).json({ error: "CRM não configurado." });
  }

  const cookie = (req.headers.cookie || "")
    .split(";")
    .map(s => s.trim())
    .find(s => s.startsWith("mimbox_admin_session="));

  let token = "";

  try {
    token = cookie
      ? decodeURIComponent(cookie.slice("mimbox_admin_session=".length))
      : "";
  } catch {
    return res.status(401).json({ error: "Sessão inválida." });
  }

  if (!token) {
    return res.status(401).json({ error: "Faça login no ADM." });
  }

  try {
    // Verifica se a sessão é válida.
    const userResponse = await fetch(`${base}/auth/v1/user`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: "Sessão expirada." });
    }

    const user = await userResponse.json();

    if (!user?.id) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`
    };

    // Confirma que o usuário é administrador.
    const adminResponse = await fetch(
      `${base}/rest/v1/administradores?usuario_id=eq.${encodeURIComponent(user.id)}&select=usuario_id&limit=1`,
      { headers }
    );

    if (!adminResponse.ok) {
      throw new Error("Falha ao validar administrador");
    }

    const admins = await adminResponse.json();

    if (!Array.isArray(admins) || admins.length === 0) {
      return res.status(403).json({ error: "Acesso não autorizado." });
    }

    // Busca pedidos e clientes relacionados.
    const ordersResponse = await fetch(
      `${base}/rest/v1/pedidos?select=*,clientes(nome,telefone,email)&order=criado_em.desc&limit=100`,
      { headers }
    );

    if (!ordersResponse.ok) {
      const details = await ordersResponse.json().catch(() => ({}));
      console.error(
        "Erro ao buscar pedidos:",
        ordersResponse.status,
        details.code || "",
        details.message || ""
      );
      throw new Error("Falha ao consultar pedidos");
    }

    const pedidos = await ordersResponse.json();

    return res.status(200).json({ pedidos });

  } catch (error) {
    console.error("Erro em admin-pedidos:", error.message);

    return res.status(500).json({
      error: "Não foi possível carregar os pedidos."
    });
  }
}

