export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Carrinho vazio"
      });
    }

    const products = {
      "Kit 4 Copos Mimbox": 5990,
      "Clube Mimbox 3 meses": 24990,
      "Clube Mimbox 6 meses": 44990,
      "Clube Mimbox 9 meses": 69990
    };

    const validItems = items.every(item =>
      item &&
      typeof item.description === "string" &&
      Object.hasOwn(products, item.description) &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0 &&
      item.quantity <= 20
    );

    if (!validItems) {
      return res.status(400).json({
        error: "Itens inválidos"
      });
    }

    const checkoutItems = items.map(item => ({
      quantity: item.quantity,
      price: products[item.description],
      description: item.description
    }));

    const response = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          handle: "mimbox",
          items: checkoutItems
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
      error: "Falha ao processar o pagamento"
    });
  }
}
