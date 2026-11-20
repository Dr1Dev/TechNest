const token = sessionStorage.getItem('token');
if (!token) location.href = 'login.html';
const $ = id => document.getElementById(id);
const money = n => '$' + Number(n).toFixed(2);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { CPU: '⚙️', GPU: '🎮', RAM: '🧩', Storage: '💾', Laptop: '💻', Peripherals: '🖱️' };
let products = [], cart = [], category = 'All', payMethod = 'Cash', editingId = null;

const pic = p => p.ImageURL ? `<img src="${esc(p.ImageURL)}" alt="">` : `<span class="ph">${ICON[p.Category] || '📦'}</span>`;

function toast(msg, ok = true) {
  const t = $('toast'); t.textContent = msg; t.className = 'show ' + (ok ? 'ok' : 'err');
  setTimeout(() => t.className = '', 2800);
}

async function api(url, opts = {}) {
  opts.headers = { ...(opts.headers || {}), Authorization: 'Bearer ' + token };
  const res = await fetch(url, opts);
  if (res.status === 401) { sessionStorage.clear(); location.href = 'login.html'; throw new Error('Please log in'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const user = sessionStorage.getItem('user') || '?';
$('uname').textContent = user; $('avatar').textContent = user[0].toUpperCase();

// ---- Navigation ----
document.querySelectorAll('.nav[data-tab]').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('.nav, .panel').forEach(e => e.classList.remove('active'));
  btn.classList.add('active'); $(btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'sales') loadSales();
});
$('logoutBtn').onclick = async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
  sessionStorage.clear(); location.href = 'login.html';
};

// ---- Products ----
async function loadProducts() {
  try { products = await api('/api/products'); renderCats(); renderProducts(); renderInventory(); }
  catch (e) { toast(e.message, false); }
}

function renderCats() {
  const cats = ['All', ...new Set(products.map(p => p.Category))];
  if (!cats.includes(category)) category = 'All';
  $('cats').innerHTML = cats.map(c => `<button class="cat ${c === category ? 'active' : ''}" onclick="setCat('${c}')">${c === 'All' ? 'All Items' : c}</button>`).join('');
}
function setCat(c) { category = c; renderCats(); renderProducts(); }

function renderProducts() {
  const q = $('searchBox').value.toLowerCase();
  $('productGrid').innerHTML = products
    .filter(p => (category === 'All' || p.Category === category) && (p.Name + p.Category).toLowerCase().includes(q))
    .map(p => `<div class="product ${cart.some(c => c.id === p.ProductID) ? 'sel' : ''} ${p.Stock === 0 ? 'out' : ''}" onclick="addToCart(${p.ProductID})">
      <div class="pimg">${pic(p)}<span class="left-badge ${p.Stock <= 5 ? 'low' : ''}">${p.Stock} Left</span></div>
      <div class="pinfo"><span>${esc(p.Name)}</span><span class="price">${money(p.Price)}</span></div>
      <button class="addbtn">+ Add to Cart</button></div>`).join('')
    || '<p class="muted">No products found</p>';
}
$('searchBox').oninput = renderProducts;

function renderInventory() {
  $('inventoryBody').innerHTML = products.map(p => `<tr><td><div class="thumb">${pic(p)}</div></td>
    <td>${p.ProductID}</td><td>${esc(p.Name)}</td><td>${esc(p.Category)}</td><td>${money(p.Price)}</td>
    <td class="${p.Stock <= 5 ? 'low' : ''}">${p.Stock}</td>
    <td><button class="link" onclick="editProduct(${p.ProductID})">Edit</button>
    <button class="rm" onclick="removeProduct(${p.ProductID})">Remove</button></td></tr>`).join('');
}

function resetForm() {
  editingId = null; $('productForm').reset();
  $('formTitle').textContent = 'Add New Product'; $('saveBtn').textContent = 'Add Product';
  $('cancelEdit').style.display = 'none';
}
function editProduct(id) {
  const p = products.find(x => x.ProductID === id); editingId = id;
  $('pName').value = p.Name; $('pCategory').value = p.Category; $('pPrice').value = p.Price; $('pStock').value = p.Stock;
  $('formTitle').textContent = 'Edit Product #' + id + ' (choose a picture only to replace it)';
  $('saveBtn').textContent = 'Save Changes'; $('cancelEdit').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('cancelEdit').onclick = resetForm;
async function removeProduct(id) {
  if (!confirm('Remove this product from the catalog? Past sales are kept.')) return;
  try { await api('/api/products/' + id, { method: 'DELETE' }); toast('Product removed'); loadProducts(); }
  catch (e) { toast(e.message, false); }
}

$('productForm').onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData();
  fd.append('name', $('pName').value.trim()); fd.append('category', $('pCategory').value);
  fd.append('price', $('pPrice').value); fd.append('stock', $('pStock').value);
  if ($('pImage').files[0]) fd.append('image', $('pImage').files[0]);
  try {
    await api(editingId ? '/api/products/' + editingId : '/api/products', { method: editingId ? 'PUT' : 'POST', body: fd });
    const wasEdit = editingId; resetForm(); toast(wasEdit ? 'Product updated' : 'Product added'); loadProducts();
  } catch (err) { toast(err.message, false); }
};

// ---- Cart ----
function addToCart(id) {
  const p = products.find(x => x.ProductID === id), line = cart.find(c => c.id === id);
  if (line) { if (line.qty < p.Stock) line.qty++; else return toast('Not enough stock', false); }
  else cart.push({ id, qty: 1 });
  renderCart();
}
function changeQty(id, d) {
  const line = cart.find(c => c.id === id), p = products.find(x => x.ProductID === id);
  line.qty += d;
  if (line.qty > p.Stock) { line.qty = p.Stock; toast('Not enough stock', false); }
  if (line.qty <= 0) cart = cart.filter(c => c.id !== id);
  renderCart();
}
function removeLine(id) { cart = cart.filter(c => c.id !== id); renderCart(); }

function renderCart() {
  let total = 0, count = 0;
  $('cartItems').innerHTML = cart.map(c => {
    const p = products.find(x => x.ProductID === c.id);
    total += Number(p.Price) * c.qty; count += c.qty;
    return `<div class="citem"><div class="thumb">${pic(p)}</div>
      <div class="cinfo"><b>${esc(p.Name)}</b><span class="price">${money(p.Price * c.qty)}</span>
      <div class="qty"><button onclick="changeQty(${c.id},-1)">-</button> ${c.qty} <button onclick="changeQty(${c.id},1)">+</button></div></div>
      <button class="trash" onclick="removeLine(${c.id})">🗑</button></div>`;
  }).join('') || '<p class="muted">Cart is empty</p>';
  const d = Math.min(100, Math.max(0, parseFloat($('discount').value) || 0));
  const final = Math.round(total * (1 - d / 100) * 100) / 100;
  $('subtotal').textContent = money(total); $('discAmt').textContent = '-' + money(total - final);
  $('itemCount').textContent = count; $('total').textContent = money(final);
  renderProducts();
}

const clearCart = () => { cart = []; $('discount').value = 0; renderCart(); };
$('discount').oninput = renderCart;
$('clearBtn').onclick = clearCart; $('newSale').onclick = () => {
  clearCart(); $('searchBox').value = '';
  document.querySelector('.nav[data-tab="pos"]').click();
};
document.querySelectorAll('.pm').forEach(b => b.onclick = () => {
  document.querySelectorAll('.pm').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); payMethod = b.dataset.pm;
});

$('completeBtn').onclick = async () => {
  if (!cart.length) return toast('Cart is empty', false);
  try {
    const r = await api('/api/sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart.map(c => ({ productId: c.id, quantity: c.qty })), paymentMethod: payMethod, discountPercent: parseFloat($('discount').value) || 0 })
    });
    toast(`Sale #${r.saleId} completed - ${money(r.total)}`);
    cart = []; $('discount').value = 0; await loadProducts(); renderCart();
  } catch (e) { toast(e.message, false); loadProducts(); }
};

// ---- Sales history ----
async function loadSales() {
  try {
    const sales = await api('/api/sales');
    $('salesBody').innerHTML = sales.map(s => `<tr><td>#${s.SaleID}</td><td>${new Date(s.SaleDate).toLocaleString()}</td>
      <td>${s.Items}</td><td>${esc(s.PaymentMethod)}</td><td>${esc(s.Cashier || '-')}</td><td>${Number(s.DiscountPercent || 0)}%</td><td><b>${money(s.Total)}</b></td></tr>`).join('')
      || '<tr><td colspan="7">No sales yet</td></tr>';
  } catch (e) { toast(e.message, false); }
}

loadProducts().then(renderCart);
