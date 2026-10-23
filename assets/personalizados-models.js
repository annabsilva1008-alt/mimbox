(function (global) {
  'use strict';
  const models = [
    ['bambu', 'Copo com tampa de bambu', '/assets/modelo-copo-bambu-768.webp'],
    ['canequinha', 'Canequinha', '/assets/modelo-canequinha-hd-1254.webp'],
    ['porta-treco', 'Cinzeiro / porta-treco', '/assets/modelo-porta-treco-hd-1254.webp'],
    ['prato', 'Prato decorativo', '/assets/modelo-prato-hd-1254.webp']
  ].map(([key, name, image]) => Object.freeze({key, name, image, collection: 'Personalizados — ' + name}));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  global.MimboxCustomModels = Object.freeze({models: Object.freeze(models), norm,
    matches: (product, model) => norm(product.colecao) === norm(model.collection)
  });
})(window);
