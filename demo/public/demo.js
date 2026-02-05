document.addEventListener('DOMContentLoaded', () => {
  // Intercept forms with data-agent-endpoint
  document.querySelectorAll('form[data-agent-endpoint]').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const endpoint = form.getAttribute('data-agent-endpoint');
      const method = form.getAttribute('data-agent-method') || 'POST';
      const headersAttr = form.getAttribute('data-agent-headers');
      const headers = headersAttr ? JSON.parse(headersAttr) : { 'Content-Type': 'application/json' };

      // Gather params from data-agent-param inputs
      const params = {};
      form.querySelectorAll('[data-agent-param]').forEach(input => {
        const paramName = input.getAttribute('data-agent-param');
        const parts = paramName.split('.');
        let obj = params;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = input.type === 'checkbox' ? input.checked : input.value;
      });

      try {
        const res = await fetch(endpoint, {
          method,
          headers,
          body: JSON.stringify(params)
        });
        const data = await res.json();

        if (data.success) {
          if (data.cartCount !== undefined) {
            const badge = document.getElementById('cart-badge');
            if (badge) badge.textContent = data.cartCount;
          }
          if (data.redirect) {
            window.location.href = data.redirect;
            return;
          }
          showToast(data.message || 'Success!');
        } else {
          showToast(data.message || 'Something went wrong', 'error');
        }
      } catch (err) {
        showToast('Network error. Please try again.', 'error');
      }
    });
  });
});

function removeFromCart(itemId) {
  fetch('/api/cart/' + itemId, { method: 'DELETE' })
    .then(r => r.json())
    .then(data => {
      if (data.success) window.location.reload();
      else showToast(data.message || 'Failed to remove item', 'error');
    })
    .catch(() => showToast('Network error', 'error'));
}

function showToast(message, type) {
  type = type || 'success';
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
