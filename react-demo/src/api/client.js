// API client for communicating with the Python backend
// If VITE_API_URL is not set or empty, use same origin (for single-service deployment)
const API_BASE_URL = import.meta.env.VITE_API_URL || 
                     (import.meta.env.DEV ? 'http://localhost:8000' : '');

export const apiClient = {
  async checkHealth() {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    return response.json();
  },

  // Initialize a new episode with specified agent (baseline or fair)
  async initEpisode(agentType, seed = null) {
    const response = await fetch(`${API_BASE_URL}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_type: agentType, seed }),
    });
    if (!response.ok) {
      throw new Error(`Init failed: ${response.statusText}`);
    }
    return response.json();
  },

  // Execute one simulation step (model predicts action, env advances)
  async stepEnvironment(episodeId) {
    const response = await fetch(`${API_BASE_URL}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episode_id: episodeId }),
    });
    if (!response.ok) {
      throw new Error(`Step failed: ${response.statusText}`);
    }
    return response.json();
  },

  async resetEnvironments() {
    const response = await fetch(`${API_BASE_URL}/reset`, {
      method: 'POST',
    });
    return response.json();
  },
};
