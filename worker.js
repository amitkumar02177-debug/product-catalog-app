export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/search' && request.method === 'GET') {
      return handleSearch(url, env);
    }
    
    if (url.pathname === '/api/submit' && request.method === 'POST') {
      return handleSubmit(request, env);
    }

    // Serve the complete frontend application
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML_PAGE, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function handleSearch(url, env) {
  const queryType = url.searchParams.get('type') || '';
  const queryName = (url.searchParams.get('name') || '').toLowerCase();

  try {
    const githubUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/data/products.json?t=${Date.now()}`;
    const res = await fetch(githubUrl, {
      headers: {
        'User-Agent': 'CloudflareWorker-App',
        'Authorization': `Bearer ${env.GITHUB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    if (!res.ok) return new Response(JSON.stringify([]), { headers: HEADERS });

    const fileData = await res.json();
    const content = JSON.parse(atob(fileData.content.replace(/\n/g, '')));

    const filtered = content.filter(item => {
      const matchType = queryType ? item.type === queryType : true;
      const matchName = queryName ? item.name.toLowerCase().includes(queryName) : true;
      return matchType && matchName;
    });

    return new Response(JSON.stringify(filtered), { headers: HEADERS, status: 200 });
  } catch (err) {
    return new Response(JSON.stringify([]), { headers: HEADERS, status: 200 });
  }
}

async function handleSubmit(request, env) {
  try {
    const body = await request.json();

    // 1. Password Verification Check
    if (!body.password || body.password !== env.SUBMISSION_PASSWORD) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized: Incorrect password' }), {
        headers: HEADERS,
        status: 401
      });
    }

    // 2. Input Validation
    if (!body.name || !body.type || !body.description || !body.image) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid payload fields' }), { headers: HEADERS, status: 400 });
    }

    const timestamp = Date.now();
    const sanitizeName = body.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const imagePath = `uploads/images/${timestamp}_${sanitizeName}.png`;

    // 3. Commit Image to GitHub
    const imageCommitUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${imagePath}`;
    const imgRes = await fetch(imageCommitUrl, {
      method: 'PUT',
      headers: {
        'User-Agent': 'CloudflareWorker-App',
        'Authorization': `Bearer ${env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `upload image: ${imagePath}`,
        content: body.image.content
      })
    });

    if (!imgRes.ok) throw new Error('Failed to commit image asset to GitHub');

    const imageUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/main/${imagePath}`;

    // 4. Fetch & Update JSON Data Store
    const dataPath = `data/products.json`;
    const dataUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${dataPath}`;
    const dataRes = await fetch(dataUrl, {
      headers: {
        'User-Agent': 'CloudflareWorker-App',
        'Authorization': `Bearer ${env.GITHUB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    let products = [];
    let sha = null;

    if (dataRes.ok) {
      const fileData = await dataRes.json();
      sha = fileData.sha;
      products = JSON.parse(atob(fileData.content.replace(/\n/g, '')));
    }

    products.push({
      id: timestamp.toString(),
      type: body.type,
      name: body.name,
      description: body.description,
      imageUrl: imageUrl
    });

    const updateRes = await fetch(dataUrl, {
      method: 'PUT',
      headers: {
        'User-Agent': 'CloudflareWorker-App',
        'Authorization': `Bearer ${env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `add product: ${body.name}`,
        content: btoa(JSON.stringify(products, null, 2)),
        sha: sha
      })
    });

    if (!updateRes.ok) throw new Error('Failed to update products store JSON');

    return new Response(JSON.stringify({ success: true }), { headers: HEADERS, status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { headers: HEADERS, status: 500 });
  }
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Product Catalog App</title>
  <style>
    :root {
      --primary-color: #0066cc;
      --bg-color: #f4f6f9;
      --card-bg: #ffffff;
      --text-color: #1a1a1a;
      --text-muted: #666666;
      --border-color: #e0e0e0;
      --radius: 12px;
      --shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg-color); color: var(--text-color); padding-bottom: 24px; }
    .app-header { background-color: var(--card-bg); padding: 16px 20px 0 20px; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; z-index: 100; }
    .app-header h1 { font-size: 1.4rem; margin-bottom: 12px; }
    .nav-tabs { display: flex; gap: 16px; }
    .tab-btn { background: none; border: none; padding: 12px 8px; font-size: 1rem; font-weight: 600; color: var(--text-muted); border-bottom: 3px solid transparent; cursor: pointer; flex: 1; }
    .tab-btn.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
    .container { max-width: 600px; margin: 20px auto; padding: 0 16px; }
    .hidden-view, .hidden { display: none !important; }
    .card-form { background: var(--card-bg); padding: 20px; border-radius: var(--radius); box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 16px; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 0.875rem; font-weight: 600; color: var(--text-muted); }
    .form-input { width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 1rem; background-color: #fafafa; }
    .form-input:focus { outline: none; border-color: var(--primary-color); background-color: #fff; }
    .btn { padding: 14px; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; text-align: center; }
    .btn-primary { background-color: var(--primary-color); color: #fff; }
    .btn-secondary { background-color: #e4e6eb; color: #333; }
    .form-actions { display: flex; gap: 12px; }
    .form-actions .btn { flex: 1; }
    .preview-box img { width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px; margin-top: 8px; }
    .results-grid { margin-top: 20px; display: flex; flex-direction: column; gap: 16px; }
    .product-card { background: var(--card-bg); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); display: flex; gap: 16px; align-items: center; }
    .product-card img { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; background-color: #eee; }
    .product-info h3 { font-size: 1.1rem; margin-bottom: 4px; }
    .product-info .badge { display: inline-block; background: #eef5ff; color: var(--primary-color); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-bottom: 6px; }
    .product-info p { font-size: 0.875rem; color: var(--text-muted); }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background-color: #323232; color: #fff; padding: 12px 24px; border-radius: 24px; font-size: 0.9rem; z-index: 1000; }
  </style>
</head>
<body>
  <header class="app-header">
    <h1>Product Hub</h1>
    <nav class="nav-tabs">
      <button id="tab-search-btn" class="tab-btn active" onclick="switchTab('search')">Search</button>
      <button id="tab-submit-btn" class="tab-btn" onclick="switchTab('submit')">Add New</button>
    </nav>
  </header>

  <main class="container">
    <!-- SEARCH VIEW -->
    <section id="search-view" class="view active-view">
      <form id="search-form" class="card-form" onsubmit="handleSearch(event)">
        <div class="form-group">
          <label for="search-type">Product Category</label>
          <select id="search-type" class="form-input">
            <option value="">All Categories</option>
            <option value="Mobile">Mobile</option>
            <option value="Appliance">Appliance</option>
            <option value="Electronics">Electronics</option>
          </select>
        </div>
        <div class="form-group">
          <label for="search-query">Product Name</label>
          <input type="text" id="search-query" class="form-input" placeholder="e.g. iPhone 15, Refrigerator" required>
        </div>
        <button type="submit" class="btn btn-primary">Search Catalog</button>
      </form>

      <div id="results-container" class="results-grid"></div>
    </section>

    <!-- SUBMISSION VIEW -->
    <section id="submit-view" class="view hidden-view">
      <form id="submit-form" class="card-form" onsubmit="handleSubmit(event)">
        <h2>Submit Product</h2>
        <div class="form-group">
          <label for="submit-type">Product Type</label>
          <select id="submit-type" class="form-input" required>
            <option value="">Select Type</option>
            <option value="Mobile">Mobile</option>
            <option value="Appliance">Appliance</option>
            <option value="Electronics">Electronics</option>
          </select>
        </div>
        <div class="form-group">
          <label for="submit-name">Product Name</label>
          <input type="text" id="submit-name" class="form-input" placeholder="Enter full name" required maxlength="100">
        </div>
        <div class="form-group">
          <label for="submit-image">Product Image</label>
          <input type="file" id="submit-image" class="form-input" accept="image/png, image/jpeg, image/webp" required onchange="previewImage(event)">
          <div id="image-preview-container" class="preview-box hidden">
            <img id="image-preview" src="" alt="Preview">
          </div>
        </div>
        <div class="form-group">
          <label for="submit-description">Description</label>
          <textarea id="submit-description" class="form-input" rows="4" placeholder="Enter product details..." required maxlength="500"></textarea>
        </div>
        <div class="form-group">
          <label for="submit-password">Submission Password</label>
          <input type="password" id="submit-password" class="form-input" placeholder="Enter security password" required>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="switchTab('search')">Cancel</button>
          <button type="submit" class="btn btn-primary" id="submit-btn">Submit Product</button>
        </div>
      </form>
    </section>
  </main>

  <div id="toast" class="toast hidden"></div>

  <script>
    function switchTab(tabName) {
      const searchView = document.getElementById('search-view');
      const submitView = document.getElementById('submit-view');
      const searchBtn = document.getElementById('tab-search-btn');
      const submitBtn = document.getElementById('tab-submit-btn');

      if (tabName === 'search') {
        searchView.classList.remove('hidden-view');
        submitView.classList.add('hidden-view');
        searchBtn.classList.add('active');
        submitBtn.classList.remove('active');
      } else {
        submitView.classList.remove('hidden-view');
        searchView.classList.add('hidden-view');
        submitBtn.classList.add('active');
        searchBtn.classList.remove('active');
      }
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.innerText = message;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    function previewImage(event) {
      const file = event.target.files[0];
      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          showToast('Image size exceeds maximum limit of 2MB.');
          event.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
          document.getElementById('image-preview').src = e.target.result;
          document.getElementById('image-preview-container').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      }
    }

    async function handleSearch(event) {
      event.preventDefault();
      const type = document.getElementById('search-type').value;
      const name = document.getElementById('search-query').value.trim();
      const resultsContainer = document.getElementById('results-container');

      resultsContainer.innerHTML = '<p>Searching...</p>';

      try {
        const response = await fetch(\`/api/search?type=\${encodeURIComponent(type)}&name=\${encodeURIComponent(name)}\`);
        if (!response.ok) throw new Error('Failed to fetch products');

        const products = await response.json();
        resultsContainer.innerHTML = '';

        if (products.length === 0) {
          resultsContainer.innerHTML = '<p>No products found matching your criteria.</p>';
          return;
        }

        products.forEach(product => {
          const card = document.createElement('div');
          card.className = 'product-card';
          card.innerHTML = \`
            <img src="\${product.imageUrl || 'https://via.placeholder.com/80'}" alt="\${product.name}">
            <div class="product-info">
              <span class="badge">\${product.type}</span>
              <h3>\${product.name}</h3>
              <p>\${product.description}</p>
            </div>
          \`;
          resultsContainer.appendChild(card);
        });
      } catch (error) {
        showToast('Search error: ' + error.message);
        resultsContainer.innerHTML = '<p>Error loading products.</p>';
      }
    }

    async function handleSubmit(event) {
      event.preventDefault();
      const submitBtn = document.getElementById('submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerText = 'Submitting...';

      const type = document.getElementById('submit-type').value;
      const name = document.getElementById('submit-name').value.trim();
      const description = document.getElementById('submit-description').value.trim();
      const password = document.getElementById('submit-password').value;
      const imageFile = document.getElementById('submit-image').files[0];

      if (!imageFile) {
        showToast('Please select an image');
        submitBtn.disabled = false;
        submitBtn.innerText = 'Submit Product';
        return;
      }

      const reader = new FileReader();
      reader.onload = async function(e) {
        const base64Image = e.target.result.split(',')[1];
        const payload = {
          type,
          name,
          description,
          password,
          image: {
            filename: imageFile.name,
            content: base64Image
          }
        };

        try {
          const response = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (response.ok && result.success) {
            showToast('Product successfully submitted!');
            document.getElementById('submit-form').reset();
            document.getElementById('image-preview-container').classList.add('hidden');
            switchTab('search');
          } else {
            throw new Error(result.message || 'Submission failed');
          }
        } catch (err) {
          showToast('Error: ' + err.message);
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Submit Product';
        }
      };

      reader.readAsDataURL(imageFile);
    }
  </script>
</body>
</html>`;
