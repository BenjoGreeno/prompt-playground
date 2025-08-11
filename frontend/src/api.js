const BASE = import.meta.env.REACT_APP_BACKEND_URL;

export const api = (path) => `${BASE}${path}`;

// CSRF token management
let csrfToken = null;

export async function getCsrfToken() {
  if (!csrfToken) {
    try {
      const response = await fetch(api("/csrf-token"), { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      csrfToken = data.csrf_token;
    } catch (error) {
      console.error('Failed to get CSRF token:', error);
      throw new Error('Failed to initialize security token');
    }
  }
  return csrfToken;
}

// Helper function for API calls with CSRF protection
async function apiCall(url, options = {}) {
  const token = await getCsrfToken();
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token,
    ...options.headers
  };
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.detail || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  
  return response.json();
}

export async function createTask(body) {
  return apiCall(api("/tasks"), {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function deleteTask(id) {
  return apiCall(api(`/tasks/${id}`), {
    method: "DELETE"
  });
}

export async function createEvent(id, body) {
  return apiCall(api(`/tasks/${id}/events`), {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function getSummary(id) {
  const response = await fetch(api(`/tasks/${id}/summary`));
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.detail || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

// Template API functions
export async function createTemplate(body) {
  return apiCall(api("/templates"), {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function deleteTemplate(id) {
  return apiCall(api(`/templates/${id}`), {
    method: "DELETE"
  });
}

// Daily task functions
export async function getDailyTasks(date) {
  const response = await fetch(api(`/tasks/daily/${date}`));
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.detail || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function generateDailyTasks(date) {
  return apiCall(api(`/tasks/generate-daily/${date}`), {
    method: "POST"
  });
}

export async function getDailyReport(date) {
  const response = await fetch(api(`/reports/daily/${date}`));
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.detail || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

// Helper function to format date as YYYY-MM-DD
export function formatDate(date) {
  return date.toISOString().split('T')[0];
}