(function () {
  'use strict';
  if (!window.MimboxCupAdmin || typeof window.products !== 'function') return;
  const original = window.products;
  window.products = function(area) {
    original(area);
    const section = card('Preços de Personalizados');
    const link = element('a', 'Editar preços e descontos dos copos →', 'btn');
    link.href = '/admin.html?area=personalizados';
    section.append(element('p', 'Americano, copos de 200 ml e copos de 300 ml têm uma área própria no menu Personalizados.'), link);
    area.prepend(section);
  };
})();
