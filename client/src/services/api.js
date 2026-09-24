import axios from 'axios';

// Create an Axios instance
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Federation API Requests ──────────────────────────────────────────────────

/**
 * Register a new federation
 * @param {Object} federationData { name, email, amount, noOfWorkers }
 */
export const registerFederationApi = async (federationData) => {
  const response = await api.post('/federation/register', federationData);
  return response.data;
};

/**
 * Check if federation exists by email
 * @param {string} email
 */
export const checkFederationByEmailApi = async (email) => {
  const response = await api.get(`/federation/check-email/${encodeURIComponent(email)}`);
  return response.data;
};

/**
 * Fetch all registered federations
 * @param {string} [status] Optional filter by status ('unverified' | 'verified' | 'rejected')
 */
export const getAllFederationsApi = async (status) => {
  const response = await api.get('/federation/all', {
    params: status && status !== 'all' ? { status } : {},
  });
  return response.data;
};

/**
 * Update verification status of a federation (Government action)
 * @param {string} id Federation ID
 * @param {string} status 'verified' | 'rejected'
 * @param {string} [rejectionReason] Optional reason if rejected
 */
export const verifyFederationApi = async (id, status, rejectionReason) => {
  const response = await api.patch(`/federation/${id}/verify`, {
    status,
    rejectionReason,
  });
  return response.data;
};

export default api;
