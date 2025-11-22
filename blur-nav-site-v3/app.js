const API_BASE = '';

function getToken() {
  return localStorage.getItem('authToken');
}

function setToken(token) {
  if (token) localStorage.setItem('authToken', token);
  else localStorage.removeItem('authToken');
}

async function apiFetch(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка запроса');
  }
  return res.json();
}

function showStatus(el, message, type = 'info') {
  if (!el) return;
  el.textContent = message;
  el.className = 'auth-message';
  if (type === 'error') el.classList.add('auth-message--error');
  if (type === 'success') el.classList.add('auth-message--success');
}

// Register/Login page logic
async function initRegisterPage() {
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const authMessage = document.getElementById('authMessage');
  const tabs = document.querySelectorAll('.auth-tab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      document.querySelectorAll('.auth-form').forEach((form) => {
        form.classList.toggle('auth-form--active', form.dataset.mode === mode);
      });
      showStatus(authMessage, '');
    });
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showStatus(authMessage, '');
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const role = document.getElementById('regRole').value;

    if (!email || !password) {
      showStatus(authMessage, 'Заполните почту и пароль.', 'error');
      return;
    }
    try {
      const data = await apiFetch('/api/register', { method: 'POST', body: { email, password, role } });
      setToken(data.token);
      showStatus(authMessage, `Создан ${role} с ID ${data.user.id}. Перенаправляем...`, 'success');
      setTimeout(() => (window.location.href = 'profile.html'), 1200);
    } catch (err) {
      showStatus(authMessage, err.message, 'error');
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showStatus(authMessage, '');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    if (!email || !password) {
      showStatus(authMessage, 'Введите почту и пароль.', 'error');
      return;
    }
    try {
      const data = await apiFetch('/api/login', { method: 'POST', body: { email, password } });
      setToken(data.token);
      showStatus(authMessage, `Добро пожаловать, ${data.user.role}. Переходим в кабинет...`, 'success');
      setTimeout(() => (window.location.href = 'profile.html'), 1000);
    } catch (err) {
      showStatus(authMessage, err.message, 'error');
    }
  });
}

// Profile page
async function initProfilePage() {
  const infoEl = document.getElementById('profileInfo');
  const myItemsEl = document.getElementById('myItems');
  const adminPanelEl = document.getElementById('adminPanel');
  const cartEl = document.getElementById('cartList');
  const messageEl = document.getElementById('profileMessage');
  const addItemForm = document.getElementById('createItemForm');

  async function loadProfile() {
    try {
      const data = await apiFetch('/api/profile');
      infoEl.innerHTML = `<strong>${data.user.email}</strong> · роль: ${data.user.role.toUpperCase()} · ваш ID: ${data.user.id}`;
      renderMyItems(data.items);
      renderCart(data.cart);
      if (data.user.role === 'admin') {
        adminPanelEl.style.display = 'block';
        loadAdminItems();
      }
    } catch (err) {
      showStatus(messageEl, err.message, 'error');
    }
  }

  function renderMyItems(items) {
    myItemsEl.innerHTML = '';
    if (!items.length) {
      myItemsEl.innerHTML = '<li>Пока нет выставленных товаров.</li>';
      return;
    }
    items.forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${item.title}</strong> (#${item.id}) — ${item.description || 'без описания'} · ${item.price || 0}₽`;
      myItemsEl.appendChild(li);
    });
  }

  function renderCart(items) {
    cartEl.innerHTML = '';
    if (!items.length) {
      cartEl.innerHTML = '<li>Корзина пуста.</li>';
      return;
    }
    items.forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${item.title}</strong> (#${item.id}) <button data-id="${item.id}" class="inline-btn">Убрать</button>`;
      cartEl.appendChild(li);
    });
  }

  cartEl?.addEventListener('click', async (e) => {
    if (e.target.matches('button[data-id]')) {
      const id = e.target.dataset.id;
      try {
        await apiFetch(`/api/cart/${id}`, { method: 'DELETE' });
        await loadProfile();
      } catch (err) {
        showStatus(messageEl, err.message, 'error');
      }
    }
  });

  addItemForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('itemTitle').value.trim();
    const description = document.getElementById('itemDescription').value.trim();
    const price = document.getElementById('itemPrice').value.trim();
    const imageInput = document.getElementById('itemImage');
    const file = imageInput.files[0];
    let imageUrl = '';
    if (file) {
      imageUrl = await toBase64(file);
    }
    if (!title) {
      showStatus(messageEl, 'Название обязательно', 'error');
      return;
    }
    try {
      await apiFetch('/api/items', { method: 'POST', body: { title, description, price, imageUrl } });
      addItemForm.reset();
      await loadProfile();
      showStatus(messageEl, 'Товар выставлен', 'success');
    } catch (err) {
      showStatus(messageEl, err.message, 'error');
    }
  });

  async function loadAdminItems() {
    const adminList = document.getElementById('adminItems');
    adminList.innerHTML = '';
    try {
      const items = await apiFetch('/api/items');
      items.forEach((item) => {
        const li = document.createElement('li');
        li.innerHTML = `#${item.id} — ${item.title} <button data-action="delete" data-id="${item.id}" class="inline-btn">Удалить</button>`;
        adminList.appendChild(li);
      });
    } catch (err) {
      showStatus(messageEl, err.message, 'error');
    }
  }

  document.getElementById('adminItems')?.addEventListener('click', async (e) => {
    if (e.target.matches('button[data-action="delete"]')) {
      const id = e.target.dataset.id;
      try {
        await apiFetch(`/api/items/${id}`, { method: 'DELETE' });
        showStatus(messageEl, 'Товар удалён', 'success');
        await loadAdminItems();
      } catch (err) {
        showStatus(messageEl, err.message, 'error');
      }
    }
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    setToken(null);
    window.location.href = 'register.html';
  });

  loadProfile();
}

// Catalog page
async function initCatalogPage() {
  const listEl = document.getElementById('catalogList');
  const messageEl = document.getElementById('catalogMessage');

  async function loadCatalog() {
    try {
      const items = await apiFetch('/api/items');
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.innerHTML = '<li>Пока нет товаров.</li>';
        return;
      }
      items.forEach((item) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="card">
            ${item.image_url ? `<img src="${item.image_url}" alt="${item.title}" class="thumb"/>` : ''}
            <div>
              <div><strong>${item.title}</strong> (#${item.id})</div>
              <div>${item.description || 'Без описания'}</div>
              <div>${item.price || 0}₽</div>
              <button class="inline-btn" data-id="${item.id}">В корзину</button>
            </div>
          </div>`;
        listEl.appendChild(li);
      });
    } catch (err) {
      showStatus(messageEl, err.message, 'error');
    }
  }

  listEl?.addEventListener('click', async (e) => {
    if (e.target.matches('button[data-id]')) {
      const id = e.target.dataset.id;
      try {
        await apiFetch('/api/cart', { method: 'POST', body: { itemId: id } });
        showStatus(messageEl, 'Добавлено в корзину', 'success');
      } catch (err) {
        showStatus(messageEl, err.message, 'error');
      }
    }
  });

  loadCatalog();
}

// Basket page
async function initBasketPage() {
  const listEl = document.getElementById('basketList');
  const messageEl = document.getElementById('basketMessage');

  async function loadBasket() {
    try {
      const items = await apiFetch('/api/cart');
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.innerHTML = '<li>Корзина пустая.</li>';
        return;
      }
      items.forEach((item) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${item.title}</strong> (#${item.id}) <button data-id="${item.id}" class="inline-btn">Убрать</button>`;
        listEl.appendChild(li);
      });
    } catch (err) {
      showStatus(messageEl, err.message, 'error');
    }
  }

  listEl?.addEventListener('click', async (e) => {
    if (e.target.matches('button[data-id]')) {
      const id = e.target.dataset.id;
      try {
        await apiFetch(`/api/cart/${id}`, { method: 'DELETE' });
        await loadBasket();
      } catch (err) {
        showStatus(messageEl, err.message, 'error');
      }
    }
  });

  loadBasket();
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = 'register.html';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'register') initRegisterPage();
  if (page === 'profile') {
    requireAuth();
    initProfilePage();
  }
  if (page === 'catalog') initCatalogPage();
  if (page === 'basket') {
    requireAuth();
    initBasketPage();
  }
});
