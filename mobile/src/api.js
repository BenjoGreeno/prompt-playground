import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://10.0.2.2:8001/api'; // Android emulator localhost

// CSRF token management
let csrfToken = null;

export async function getCsrfToken() {
  if (!csrfToken) {
    try {
      const response = await fetch(`${BASE_URL}/csrf-token`);
      const data = await response.json();
      csrfToken = data.csrf_token;
    } catch (error) {
      throw new Error('Failed to get CSRF token');
    }
  }
  return csrfToken;
}

async function apiCall(url, options = {}) {
  const token = await getCsrfToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    if (response.status === 403) {
      csrfToken = null;
      if (!options._retry) {
        return apiCall(url, { ...options, _retry: true });
      }
    }
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.json();
}

export const createTask = (body) => apiCall(`${BASE_URL}/tasks`, { method: 'POST', body: JSON.stringify(body) });
export const deleteTask = (id) => apiCall(`${BASE_URL}/tasks/${id}`, { method: 'DELETE' });
export const createEvent = (id, body) => apiCall(`${BASE_URL}/tasks/${id}/events`, { method: 'POST', body: JSON.stringify(body) });
export const getTasks = () => fetch(`${BASE_URL}/tasks`).then(r => r.json());
export const getSummary = (id) => fetch(`${BASE_URL}/tasks/${id}/summary`).then(r => r.json());