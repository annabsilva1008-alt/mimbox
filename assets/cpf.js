(function () {
'use strict';
function normalizeCpf(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(cpf[index]) * (length + 1 - index);
    const remainder = sum % 11;
    if (Number(cpf[length]) !== (remainder < 2 ? 0 : 11 - remainder)) return false;
  }
  return true;
}

function formatCpf(value) {
  return normalizeCpf(value).slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
}

window.MimboxCPF = Object.freeze({normalize: normalizeCpf, isValid: isValidCpf, format: formatCpf});
function bind() {
  for (const input of document.querySelectorAll('input[data-cpf]')) {
    if (input.dataset.cpfBound) continue;
    input.dataset.cpfBound = '1';
    function validate() {
      input.setCustomValidity(input.disabled || !input.required && !input.value ? '' : isValidCpf(input.value) ? '' : 'Informe um CPF válido para o destinatário.');
    }
    input.addEventListener('input', () => { input.value = formatCpf(input.value); validate(); });
    input.addEventListener('blur', validate);
    input.form?.addEventListener('change', validate);
    input.form?.addEventListener('submit', event => {
      validate();
      if (!input.disabled && !input.checkValidity()) { event.preventDefault(); event.stopImmediatePropagation(); input.focus(); input.reportValidity(); }
    }, true);
    validate();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true}); else bind();
})();
