export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "Carrinho vazio"
    });
  }

  const validItems = items.every(item =>
    typeof item.description === "string" &&
    item.description.length > 0 &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    Number.isInteger(item.price) &&
    item.price > 0
  );

  if (!validItems) {
    return res.status(400).json({
      error: "Itens inválidos"
    });
  }

  try {
    const response = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          handle: "mimbox",
          items
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Não foi possível criar o checkout"
      });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(502).json({
      error: "Falha ao conectar com a InfinitePay"
    });
  }
}
