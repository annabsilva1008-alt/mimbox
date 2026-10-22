
const PRODUCTS = {
  vsf: {
    description: "VSF — Vá Ser Feliz — Kit com 4 copos",
    price: 5990
  },
  "pe-na-areia": {
    description: "Pé na Areia — Kit com 4 copos",
    price: 5990
  },
  brasilidades: {
    description: "Brasilidades — Kit com 4 copos",
    price: 5990
  },
  mimcine: {
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

const PRODUCT_ALIASES = {
  "VSF — Vá Ser Feliz": "vsf",
  "Pé na Areia": "pe-na-areia",
  Brasilidades: "brasilidades",
  MimCine: "mimcine",
  "Clube Mimbox — 3 meses": "clube-3-meses",
  "Clube Mimbox — 6 meses": "clube-6-meses",
  "Clube Mimbox — 9 meses": "clube-9-meses"
};

const ORIGIN_CEP = "04715005";
const FREE_SHIPPING_THRESHOLD = 30000;

const PACKAGE = {
  width: 18,
  height: 9,
  length: 28,
  weight: 1.5
};

// Identificadores de produtos cadastrados no CRM.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function findCrmProducts(ids) {
  if (!ids.length) return new Map();

  const unique = [...new Set(ids)];

  const query =
    `produtos?select=id,nome,preco,disponivel` +
    `&id=in.(${unique.join(",")})`;

  const rows = await supabaseRequest(query);

  return new Map(
    (Array.isArray(rows) ? rows : []).map(
      p => [p.id.toLowerCase(), p]
    )
  );
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

async function quoteShipping(cep, itemCount, subtotal) {
  const token = process.env.MELHOR_ENVIO_TOKEN;

  if (!token) {
    throw new Error(
      "MELHOR_ENVIO_TOKEN não configurado."
    );
  }

  const response = await fetch(
    "https://www.melhorenvio.com.br/api/v2/me/shipment/calculate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mimbox (www.mimbox.com.br)"
      },
      body: JSON.stringify({
        from: {
          postal_code: ORIGIN_CEP
        },
        to: {
          postal_code: cep
        },
        package: {
          ...PACKAGE,
          weight: Number(
            (PACKAGE.weight * itemCount).toFixed(2)
          )
        },
        options: {
          insurance_value: Number(
            (subtotal / 100).toFixed(2)
          ),
          receipt: false,
          own_hand: false
        }
      })
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(data)) {
    console.error(
      "Falha na cotação Melhor Envio:",
      response.status,
      data
    );

    throw new Error(
      "Não foi possível confirmar o frete agora."
    );
  }

  return data.filter(option =>
    option &&
    !option.error &&
    option.id != null &&
    Number.isFinite(
      Number(option.custom_price ?? option.price)
    ) &&
    Number(option.custom_price ?? option.price) >= 0
  );
}

// A chave secreta permanece exclusivamente no servidor.
async function supabaseRequest(path, options = {}) {
  const base = (
    process.env.SUPABASE_URL || ""
  ).replace(/\/$/, "");

  const key = process.env.SUPABASE_SECRET_KEY;

  if (!base || !key) {
    throw new Error("Supabase não configurado");
  }

  const response = await fetch(
    `${base}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(options.headers || {})
      }
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error(
      "Erro no Supabase:",
      path.split("?")[0],
      response.status,
      data?.code || ""
    );

    throw new Error(
      "Falha ao consultar ou registrar dados no CRM"
    );
  }

  return data;
}

// A mesma função recebe o webhook para respeitar
// o limite de funções da Vercel.
// A transação é conferida na InfinitePay antes
// de marcar o pedido como pago.
async function receivePaymentWebhook(req, res) {
  const fail = (message, status = 400) =>
    res.status(status).json({
      success: false,
      message
    });

  const body = req.body || {};

  const orderNsu = String(
    body.order_nsu || ""
  ).trim();

  const transactionNsu = String(
    body.transaction_nsu || ""
  ).trim();

  const slug = String(
    body.invoice_slug || body.slug || ""
  ).trim();

  if (
    !/^mimbox-[0-9a-f-]{36}$/i.test(orderNsu) ||
    !transactionNsu ||
    !slug ||
    transactionNsu.length > 200 ||
    slug.length > 200
  ) {
    return fail("Dados de transação inválidos.");
  }

  try {
    const rows = await supabaseRequest(
      `pedidos?numero_pedido=eq.${encodeURIComponent(orderNsu)}` +
      `&select=id,numero_pedido,valor_total,status_pagamento,observacoes&limit=1`
    );

    const order = rows?.[0];

    if (!order) {
      return fail("Pedido não encontrado.");
    }

    const checkResponse = await fetch(
      "https://api.checkout.infinitepay.io/payment_check",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          handle: "mimbox",
          order_nsu: orderNsu,
          transaction_nsu: transactionNsu,
          slug
        })
      }
    );

    const checked = await checkResponse
      .json()
      .catch(() => null);

    if (
      !checkResponse.ok ||
      checked?.success !== true ||
      checked?.paid !== true
    ) {
      return fail(
        "Pagamento ainda não confirmado pela InfinitePay."
      );
    }

    const expected = Math.round(
      Number(order.valor_total) * 100
    );

    const verified = Number(checked.amount);

    if (
      !Number.isSafeInteger(expected) ||
      expected < 1 ||
      !Number.isSafeInteger(verified) ||
      verified !== expected
    ) {
      console.error(
        "Divergência no valor confirmado para",
        orderNsu
      );

      return fail(
        "Valor do pagamento não confere com o pedido."
      );
    }

    if (
      String(order.status_pagamento)
        .toLowerCase() === "pago"
    ) {
      return res.status(200).json({
        success: true,
        message: null
      });
    }

    // Guarda o NSU da transação no histórico do pedido.
    const previousNotes = String(
      order.observacoes || ""
    );

    const transactionRecord =
      `[InfinitePay NSU: ${transactionNsu}]`;

    const updatedNotes =
      previousNotes.includes(transactionRecord)
        ? previousNotes
        : (
            previousNotes
              ? previousNotes + "\n"
              : ""
          ) + transactionRecord;

    const update = {
      status_pagamento: "pago"
    };

    if (updatedNotes.length <= 1000) {
      update.observacoes = updatedNotes;
    }

    const saved = await supabaseRequest(
      `pedidos?id=eq.${encodeURIComponent(order.id)}&select=id`,
      {
        method: "PATCH",
        body: JSON.stringify(update)
      }
    );

    if (
      !Array.isArray(saved) ||
      saved.length !== 1
    ) {
      return fail(
        "Não foi possível atualizar o pedido."
      );
    }

    return res.status(200).json({
      success: true,
      message: null
    });

  } catch (error) {
    console.error(
      "Falha ao processar webhook InfinitePay:",
      error.message
    );

    return fail(
      "Falha temporária ao confirmar o pagamento."
    );
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (
    req.method === "POST" &&
    String(req.query?.webhook || "") === "1"
  ) {
    return receivePaymentWebhook(req, res);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  try {
    const {
      items,
      customer,
      deliveryMethod,
      address,
      shippingServiceId
    } = req.body || {};

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({
        error: "Carrinho vazio."
      });
    }

    if (
      !customer ||
      typeof customer.name !== "string" ||
      customer.name.trim().length < 2
    ) {
      return res.status(400).json({
        error: "Informe o nome do comprador."
      });
    }

    let phone = digits(
      customer.phone_number || customer.phone
    );

    if (
      phone.startsWith("55") &&
      phone.length > 11
    ) {
      phone = phone.slice(2);
    }

    if (
      phone.length < 10 ||
      phone.length > 11
    ) {
      return res.status(400).json({
        error: "Informe um telefone válido."
      });
    }

    const email = String(
      customer.email || ""
    ).trim().toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        error: "Informe um e-mail válido."
      });
    }

    if (
      !["shipping", "pickup"].includes(
        deliveryMethod
      )
    ) {
      return res.status(400).json({
        error: "Forma de entrega inválida."
      });
    }

    const checkoutItems = [];
    const orderItems = [];

    let shippingCents = 0;
    let shippingLabel = null;
    let shippingAddress = null;
    let subtotal = 0;
    let itemCount = 0;

    // Consulta os produtos novos no Supabase.
    // O preço enviado pelo navegador não é utilizado.
    const crmIds = items
      .map(item =>
        String(item?.id || "").trim()
      )
      .filter(id => UUID_PATTERN.test(id));

    const crmProducts = await findCrmProducts(
      crmIds
    );

    for (const item of items) {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return res.status(400).json({
          error: "Há itens inválidos no carrinho."
        });
      }

      const rawId = String(
        item.id || ""
      ).trim();

      const quantity = Number(
        item.qty ?? item.quantity ?? 1
      );

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return res.status(400).json({
          error:
            "Há produtos ou quantidades inválidos no carrinho."
        });
      }

      let product;
      let id;

      // Produto cadastrado pelo CRM.
      if (UUID_PATTERN.test(rawId)) {
        const crm = crmProducts.get(
          rawId.toLowerCase()
        );

        const value = Number(crm?.preco);
        const cents = Math.round(value * 100);

        if (
          !crm ||
          crm.disponivel !== true ||
          !Number.isFinite(value) ||
          value <= 0 ||
          !Number.isSafeInteger(cents) ||
          cents < 1 ||
          !String(crm.nome || "").trim()
        ) {
          return res.status(400).json({
            error:
              "Produto indisponível ou preço inválido. Atualize o carrinho."
          });
        }

        id = crm.id;

        product = {
          price: cents,
          description: String(
            crm.nome
          ).trim().slice(0, 120)
        };

      } else {
        // Produtos antigos e planos do Clube.
        id = Object.prototype.hasOwnProperty.call(
          PRODUCTS,
          rawId
        )
          ? rawId
          : PRODUCT_ALIASES[rawId];

        product = id
          ? PRODUCTS[id]
          : null;

        if (!product) {
          return res.status(400).json({
            error:
              "Há produtos ou quantidades inválidos no carrinho."
          });
        }
      }

      subtotal += product.price * quantity;
      itemCount += quantity;

      checkoutItems.push({
        quantity,
        price: product.price,
        description: product.description
      });

      orderItems.push({
        id,
        quantidade: quantity,
        preco_unitario: product.price / 100,
        descricao: product.description
      });
    }

    // Cálculo de frete.
    if (deliveryMethod === "shipping") {
      const cep = digits(
        address?.cep ||
        address?.postal_code
      );

      if (!/^\d{8}$/.test(cep)) {
        return res.status(400).json({
          error:
            "Informe um CEP válido para entrega."
        });
      }

      for (const field of [
        "street",
        "number",
        "neighborhood",
        "city",
        "state"
      ]) {
        if (
          !String(
            address?.[field] || ""
          ).trim()
        ) {
          return res.status(400).json({
            error:
              "Complete o endereço de entrega."
          });
        }
      }

      if (
        shippingServiceId === undefined ||
        shippingServiceId === null ||
        String(shippingServiceId).trim() === ""
      ) {
        return res.status(400).json({
          error:
            "Selecione uma transportadora antes de pagar."
        });
      }

      const quotes = await quoteShipping(
        cep,
        itemCount,
        subtotal
      );

      const chosen = quotes.find(
        option =>
          String(option.id) ===
          String(shippingServiceId)
      );

      if (!chosen) {
        return res.status(400).json({
          error:
            "A transportadora escolhida não está disponível. Recalcule o frete."
        });
      }

      shippingLabel = `${
        String(chosen.company?.name || "")
      } ${
        String(chosen.name || "")
      }`.trim();

      shippingAddress = {
        cep,
        street: String(
          address.street
        ).trim(),
        number: String(
          address.number
        ).trim(),
        neighborhood: String(
          address.neighborhood
        ).trim(),
        city: String(
          address.city
        ).trim(),
        state: String(
          address.state
        ).trim(),
        complement: String(
          address.complement || ""
        ).trim(),
        // Identificador do servico validado na cotacao do Melhor Envio.
        melhor_envio_servico_id: String(chosen.id)
      };

      const quotedPrice = Number(
        chosen.custom_price ??
        chosen.price
      );

      shippingCents =
        subtotal > FREE_SHIPPING_THRESHOLD
          ? 0
          : Math.round(
              quotedPrice * 100
            );

      if (shippingCents > 0) {
        checkoutItems.push({
          quantity: 1,
          price: shippingCents,
          description:
            `Frete — ${
              String(
                chosen.company?.name || ""
              )
            } ${
              String(
                chosen.name || ""
              )
            }`.trim().slice(0, 120)
        });
      }
    }

    // Identificador único do pedido.
    const orderNsu =
      `mimbox-${crypto.randomUUID()}`;

    const isClub = orderItems.some(
      item =>
        item.id.startsWith("clube-")
    );

    let orderSaved = false;

    // Registra cliente e pedido pendente no CRM.
    try {
      const customers = await supabaseRequest(
        "clientes?select=id",
        {
          method: "POST",
          body: JSON.stringify({
            nome: customer.name.trim(),
            telefone: "+55" + phone,
            email
          })
        }
      );

      const customerId =
        customers?.[0]?.id;

      if (!customerId) {
        throw new Error(
          "Cliente não registrado"
        );
      }

      await supabaseRequest(
        "pedidos?select=id",
        {
          method: "POST",
          body: JSON.stringify({
            cliente_id: customerId,
            numero_pedido: orderNsu,
            origem: "site",
            tipo: isClub
              ? "clube"
              : "avulso",
            valor_total:
              (subtotal + shippingCents) / 100,
            status_pagamento: "pendente",
            status_entrega: "aguardando",
            forma_entrega:
              deliveryMethod === "pickup"
                ? "retirada"
                : "transportadora",
            itens: orderItems,
            endereco_entrega:
              shippingAddress,
            frete_valor:
              shippingCents / 100,
            transportadora:
              shippingLabel
          })
        }
      );

      orderSaved = true;

    } catch (dbError) {
      console.error(
        "Falha ao salvar pedido:",
        dbError.message
      );

      return res.status(503).json({
        error:
          "Não foi possível registrar o pedido. Tente novamente antes de pagar."
      });
    }

    // Cria o pagamento na InfinitePay.
    const payload = {
      handle: "mimbox",
      order_nsu: orderNsu,
      webhook_url:
        "https://www.mimbox.com.br/api/criar-checkout?webhook=1",
      redirect_url:
        "https://www.mimbox.com.br/pagamento-retorno.html",

      customer: {
        name: customer.name.trim(),
        email,
        phone_number: "+55" + phone
      },

      items: checkoutItems
    };

    const response = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    const checkoutUrl =
      data.url ||
      data.checkout_url ||
      data.payment_url ||
      data.link;

    if (
      !response.ok ||
      typeof checkoutUrl !== "string" ||
      !checkoutUrl.startsWith("https://")
    ) {
      console.error(
        "Erro da InfinitePay:",
        response.status,
        data
      );

      if (orderSaved) {
        try {
          await supabaseRequest(
            `pedidos?numero_pedido=eq.${
              encodeURIComponent(
                orderNsu
              )
            }`,
            {
              method: "PATCH",
              body: JSON.stringify({
                status_pagamento:
                  "falha_checkout"
              })
            }
          );

        } catch (dbError) {
          console.error(
            "Falha ao atualizar pedido sem checkout:",
            dbError.message
          );
        }
      }

      return res.status(502).json({
        error:
          "Não foi possível gerar o pagamento na InfinitePay."
      });
    }

    return res.status(200).json({
      url: checkoutUrl,
      order_nsu: orderNsu
    });

  } catch (error) {
    console.error(
      "Erro ao criar checkout:",
      error
    );

    return res.status(500).json({
      error:
        "Não foi possível iniciar o pagamento. Confira a cotação e tente novamente."
    });
  }
}
