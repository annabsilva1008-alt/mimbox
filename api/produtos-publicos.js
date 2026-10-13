
export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=120"
  );

  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    return res.status(405).json({
      erro: "Método não permitido"
    });
  }

  const base = String(
    process.env.SUPABASE_URL || ""
  ).replace(/\/$/, "");

  const key = process.env.SUPABASE_SECRET_KEY;

  if (!base || !key) {
    return res.status(503).json({
      erro: "Catálogo indisponível"
    });
  }

  try {
    const url =
      `${base}/rest/v1/produtos` +
      `?select=id,nome,descricao,colecao,preco,imagem_url,disponivel,destaque,ordem` +
      `&order=ordem.asc,nome.asc&limit=200`;

    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Supabase: ${response.status}`
      );
    }

    const rows = await response.json();

    return res.status(200).json({
      produtos: rows
    });

  } catch (err) {
    console.error("produtos-publicos", err);

    return res.status(503).json({
      erro: "Não foi possível consultar o catálogo"
    });
  }
}
