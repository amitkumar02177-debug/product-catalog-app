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
    const response = await fetch(`/api/search?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
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
      card.innerHTML = `
        <img src="${product.imageUrl || 'https://via.placeholder.com/80'}" alt="${product.name}">
        <div class="product-info">
          <span class="badge">${product.type}</span>
          <h3>${product.name}</h3>
          <p>${product.description}</p>
        </div>
      `;
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