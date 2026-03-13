import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://sales-agent-app-1.preview.emergentagent.com';

const apiClient = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

class ApiService {
  private authToken: string | null = null;

  setAuthToken(token: string | null) {
    this.authToken = token;
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common['Authorization'];
    }
  }

  // Auth
  async register(name: string, email: string, password: string) {
    const response = await apiClient.post('/auth/register', { name, email, password });
    return response.data;
  }

  async login(email: string, password: string) {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  }

  async forgotPassword(email: string) {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token: string, newPassword: string) {
    const response = await apiClient.post('/auth/reset-password', { token, new_password: newPassword });
    return response.data;
  }

  async getMe() {
    const response = await apiClient.get('/auth/me');
    return response.data;
  }

  // Leads
  async getLeads() {
    const response = await apiClient.get('/leads');
    return response.data;
  }

  async getLead(id: string) {
    const response = await apiClient.get(`/leads/${id}`);
    return response.data;
  }

  async createLead(data: { name: string; phone?: string; email?: string; address?: string; notes?: string }) {
    const response = await apiClient.post('/leads', data);
    return response.data;
  }

  async updateLead(id: string, data: Partial<{ name: string; phone: string; email: string; address: string; notes: string }>) {
    const response = await apiClient.put(`/leads/${id}`, data);
    return response.data;
  }

  async deleteLead(id: string) {
    const response = await apiClient.delete(`/leads/${id}`);
    return response.data;
  }

  // Appointments
  async getAppointments() {
    const response = await apiClient.get('/appointments');
    return response.data;
  }

  async getAppointment(id: string) {
    const response = await apiClient.get(`/appointments/${id}`);
    return response.data;
  }

  async getLeadAppointments(leadId: string) {
    const response = await apiClient.get(`/appointments/lead/${leadId}`);
    return response.data;
  }

  async createAppointment(data: { lead_id: string; appointment_date: string; appointment_time: string; notes?: string; status?: string }) {
    const response = await apiClient.post('/appointments', data);
    return response.data;
  }

  async updateAppointment(id: string, data: Partial<{ lead_id: string; appointment_date: string; appointment_time: string; notes: string; status: string }>) {
    const response = await apiClient.put(`/appointments/${id}`, data);
    return response.data;
  }

  async deleteAppointment(id: string) {
    const response = await apiClient.delete(`/appointments/${id}`);
    return response.data;
  }

  // Scope of Appointment
  async createScope(data: { lead_id: string; form_fields: Record<string, any>; typed_name: string; signature?: string }) {
    const response = await apiClient.post('/scope', data);
    return response.data;
  }

  async getScope(id: string) {
    const response = await apiClient.get(`/scope/${id}`);
    return response.data;
  }

  async getLeadScopes(leadId: string) {
    const response = await apiClient.get(`/scope/lead/${leadId}`);
    return response.data;
  }

  async getScopePdf(id: string) {
    const response = await apiClient.get(`/scope/${id}/pdf`);
    return response.data;
  }

  // AI Coach
  async sendChatMessage(message: string, leadContext?: string) {
    const response = await apiClient.post('/ai-coach/chat', { message, lead_context: leadContext });
    return response.data;
  }

  async getChatHistory() {
    const response = await apiClient.get('/ai-coach/history');
    return response.data;
  }

  // OCR
  async scanBusinessCard(imageBase64: string) {
    const response = await apiClient.post('/ocr/scan', { image_base64: imageBase64 });
    return response.data;
  }

  // Subscription
  async getSubscriptionStatus() {
    const response = await apiClient.get('/subscription/status');
    return response.data;
  }

  async subscribe() {
    const response = await apiClient.post('/subscription/subscribe');
    return response.data;
  }

  async restorePurchases() {
    const response = await apiClient.post('/subscription/restore');
    return response.data;
  }

  // Route Planning
  async getDailyRoute(date: string, startLat?: number, startLng?: number) {
    const response = await apiClient.post('/routes/daily', { 
      date, 
      start_lat: startLat, 
      start_lng: startLng 
    });
    return response.data;
  }

  async geocodeLeadAddress(leadId: string) {
    const response = await apiClient.post(`/routes/geocode?lead_id=${leadId}`);
    return response.data;
  }

  async getLeadsWithCoordinates() {
    const response = await apiClient.get('/routes/leads-with-coordinates');
    return response.data;
  }

  async batchGeocodeLeads() {
    const response = await apiClient.post('/routes/batch-geocode');
    return response.data;
  }
}

export const api = new ApiService();
