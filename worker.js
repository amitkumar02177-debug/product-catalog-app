export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/search' && request.method === 'GET') {
      return handleSearch(url, env);
    }
    
    if (url.pathname === '/api/submit' && request.method === 'POST') {
      return handleSubmit(request, env);
    }

    // Serve the frontend UI directly
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
    const githubUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/data/products.json`;
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

// Paste your index.html content here inside the backticks:
const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Product Catalog</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
    <div class="max-w-4xl mx-auto p-6">
        <header class="mb-8 text-center">
            <h1 class="text-3xl font-bold text-gray-900">Product Catalog</h1>
            <p class="text-gray-600 mt-2">Welcome to your live catalog deployed via Cloudflare Workers!</p>
        </header>
        <main class="bg-white rounded-xl shadow p-6">
            <p class="text-center text-gray-500">Catalog UI is active and ready.</p>
        </main>
    </div>
</body>
</html>`;
