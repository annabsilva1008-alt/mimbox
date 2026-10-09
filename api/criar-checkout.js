
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    const { items, customer, address, deliveryMethod } = req.body || {};

    const products = {
      "mimcine": {
        description: "MimCine — Kit com 4 copos",
        price: 5990
      },
      "clube-3-meses": {
        description: "Clube Mimbox — 3 meses",
        price: 24990
      },
      "clube-6-meses": {
        description: "Clube Mimbox — 6 meses",
        price: 44990
      },
      "clube-9-meses": {
        description: "Clube Mimbox — 9 meses",
        price: 69990
      }
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Carrinho vazio." });
    }

    if (
      !customer ||
      typeof customer.name !== "string" ||
      customer.name.trim().length < 2 ||
      typeof customer.phone_number !== "string" ||
      customer.phone_number.replace(/\D/g, "").length < 10
    ) {
      return res.status(400).json({
        error: "Confira o nome e o telefone do comprador."
      });
    }

    if (!["shipping", "pickup"].includes(deliveryMethod)) {
      return res.status(400).json({
        error: "Forma de entrega inválida."
      });
    }

    // O frete ainda não está calculado no site.
    // Não cobrar entrega sem antes definir seu valor.
    if (deliveryMethod === "shipping") {
      return res.status(400).json({
        error: "O cálculo do frete ainda precisa ser configurado antes de cobrar por uma entrega."
      });
    }

    const validItems = items.every(item =>
      item &&
      typeof item.id === "string" &&
      Object.hasOwn(products, item.id) &&
      Number.isInteger(item.qty) &&
      item.qty >= 1 &&
      item.qty <= 20
    );

    if (!validItems) {
      return res.status(400).json({
        error: "Há produtos ou quantidades inválidos no carrinho."
      });
    }

    const checkoutItems = items.map(item => ({
      quantity: item.qty,
      price: products[item.id].price,
      description: products[item.id].description
    }));

    const orderNsu = `mimbox-${crypto.randomUUID()}`;

    const payload = {
      handle: "mimbox",
      order_nsu: orderNsu,
      redirect_url: "https://www.mimbox.com.br/?pagamento=retorno",
      customer: {
        name: customer.name.trim(),
        phone_number: "+55" + customer.phone_number.replace(/\D/g, "")
      },
      items: checkoutItems
    };

    const response = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok || typeof data.url !== "string") {
      console.error("Erro da InfinitePay:", response.status);
      return res.status(502).json({
        error: "A InfinitePay não conseguiu gerar o checkout. Tente novamente."
      });
    }

    return res.status(200).json({
      url: data.url,
      order_nsu: orderNsu
    });
  } catch (error) {
    console.error("Erro ao criar checkout:", error);
    return res.status(500).json({
      error: "Não foi possível iniciar o pagamento."
    });
  }
}
