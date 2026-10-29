export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/search' && request.method === 'GET') {
      return handleSearch(url, env);
    }
    
    if (url.pathname === '/api/submit' && request.method === 'POST') {
      return handleSubmit(request, env);
    }

    // Serve static files from assets or fallback
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
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