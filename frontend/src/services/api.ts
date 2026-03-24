import axios, { AxiosError } from 'axios';
import Constants from 'expo-constants';

// Get backend URL from app config extra (for production builds) or env var (for dev)
const getBackendUrl = (): string => {
  // First try app.json extra config (works in production EAS builds)
  const extraUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL;
  if (extraUrl) {
    console.log('[API] Using backend URL from app config:', extraUrl);
    return extraUrl;
  }
  
  // Then try environment variable (works in development)
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) {
    console.log('[API] Using backend URL from env:', envUrl);
    return envUrl;
  }
  
  // For web, try to use current origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    console.log('[API] Using window origin as backend URL:', window.location.origin);
    return window.location.origin;
  }
  
  // Final fallback - should not reach here in production
  console.warn('[API] No backend URL configured, using empty string');
  return '';
};

const BACKEND_URL = getBackendUrl();

// Network error types for offline handling
export type NetworkErrorType = 'offline' | 'timeout' | 'server_error' | 'unknown';

export interface ApiError {
  type: NetworkErrorType;
  message: string;
  isOffline: boolean;
  originalError?: Error;
}

// Helper to determine if error is network-related
function isNetworkError(error: AxiosError): boolean {
  return (
    !error.response && 
    (error.code === 'ECONNABORTED' || 
     error.code === 'ERR_NETWORK' || 
     error.message?.includes('Network Error') ||
     error.message?.includes('timeout') ||
     error.message?.includes('ENOTFOUND') ||
     error.message?.includes('ETIMEDOUT') ||
     error.message?.includes('ECONNREFUSED'))
  );
}

// Create user-friendly error from axios error
export function createApiError(error: any): ApiError {
  if (axios.isAxiosError(error)) {
    if (isNetworkError(error)) {
      return {
        type: 'offline',
        message: 'No internet connection. Your data is saved locally.',
        isOffline: true,
        originalError: error
      };
    }
    if (error.code === 'ECONNABORTED') {
      return {
        type: 'timeout',
        message: 'Request timed out. Please try again.',
        isOffline: false,
        originalError: error
      };
    }
    if (error.response?.status && error.response.status >= 500) {
      return {
        type: 'server_error',
        message: 'Server is temporarily unavailable.',
        isOffline: false,
        originalError: error
      };
    }
  }
  return {
    type: 'unknown',
    message: error?.message || 'An unexpected error occurred.',
    isOffline: false,
    originalError: error
  };
}

const apiClient = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for better error logging
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Don't log 401 errors for auth endpoints - they're expected for logged-out users
    const isAuthEndpoint = error.config?.url?.includes('/auth/');
    const is401 = error.response?.status === 401;
    
    if (is401 && isAuthEndpoint) {
      // Silently reject - this is expected behavior for expired/invalid tokens
      return Promise.reject(error);
    }
    
    // Log other errors for debugging (but not in production for 401s)
    if (!is401) {
      console.warn('[API Error]', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        message: error.message,
      });
    }
    return Promise.reject(error);
  }
);

class ApiService {
  private authToken: string | null = null;

  constructor() {
    console.log('[API] Service initialized with baseURL:', `${BACKEND_URL}/api`);
    
    // Add request interceptor to ensure auth token is always sent
    apiClient.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common['Authorization'];
    }
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  // Generic HTTP methods for direct API calls
  async get(url: string) {
    return apiClient.get(url);
  }

  async post(url: string, data?: any) {
    return apiClient.post(url, data);
  }

  async put(url: string, data?: any) {
    return apiClient.put(url, data);
  }

  async delete(url: string) {
    return apiClient.delete(url);
  }

  async patch(url: string, data?: any) {
    return apiClient.patch(url, data);
  }

  // Auth
  async register(name: string, email: string, password: string, inviteToken?: string) {
    const response = await apiClient.post('/auth/register', { 
      name, 
      email, 
      password,
      invite_token: inviteToken
    });
    return response.data;
  }

  // Create Organization - becomes Admin/Owner
  async createOrganization(organizationName: string, name: string, email: string, password: string, phone?: string) {
    const response = await apiClient.post('/auth/create-organization', {
      organization_name: organizationName,
      name,
      email,
      password,
      phone
    });
    return response.data;
  }

  // Register as Solo Agent - works independently
  async registerSolo(name: string, email: string, password: string, phone?: string) {
    const response = await apiClient.post('/auth/register-solo', {
      name,
      email,
      password,
      phone
    });
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

  async updateProfile(data: { name?: string; phone?: string; profile_image?: string }) {
    const response = await apiClient.put('/auth/profile', data);
    return response.data;
  }

  async deleteAccount() {
    const response = await apiClient.delete('/auth/account');
    return response.data;
  }

  // ==================== INVITATION MANAGEMENT ====================

  async createInvitation(data: { email: string; role: string; name?: string }) {
    const response = await apiClient.post('/invitations', data);
    return response.data;
  }

  async getInvitations() {
    const response = await apiClient.get('/invitations');
    return response.data;
  }

  async getInvitation(inviteId: string) {
    const response = await apiClient.get(`/invitations/${inviteId}`);
    return response.data;
  }

  async validateInvitation(token: string) {
    const response = await apiClient.get(`/invitations/validate/${token}`);
    return response.data;
  }

  async resendInvitation(inviteId: string) {
    const response = await apiClient.post(`/invitations/${inviteId}/resend`);
    return response.data;
  }

  async cancelInvitation(inviteId: string) {
    const response = await apiClient.delete(`/invitations/${inviteId}`);
    return response.data;
  }

  // ==================== USER MANAGEMENT ====================

  async getUsers() {
    const response = await apiClient.get('/users');
    return response.data;
  }

  async updateUserRole(userId: string, role: string) {
    const response = await apiClient.put(`/users/${userId}/role`, { role });
    return response.data;
  }

  async updateUserStatus(userId: string, isActive: boolean) {
    const response = await apiClient.put(`/users/${userId}/status`, { is_active: isActive });
    return response.data;
  }

  async reassignUser(userId: string, newManagerId: string) {
    const response = await apiClient.put(`/users/${userId}/reassign`, { new_manager_id: newManagerId });
    return response.data;
  }

  async approveUser(userId: string) {
    const response = await apiClient.put(`/users/${userId}/approve`);
    return response.data;
  }

  async getPendingUsers() {
    const response = await apiClient.get('/users/pending-approval');
    return response.data;
  }

  async migrateHierarchy() {
    const response = await apiClient.post('/admin/migrate-hierarchy');
    return response.data;
  }

  // ==================== ACCOUNT MODE ====================

  async getAccountMode() {
    const response = await apiClient.get('/account/mode');
    return response.data;
  }

  async joinTeam(token: string) {
    const response = await apiClient.post('/account/join-team', { token });
    return response.data;
  }

  async leaveTeam() {
    const response = await apiClient.post('/account/leave-team', { confirm: true });
    return response.data;
  }

  async validateInviteForJoin(token: string) {
    const response = await apiClient.get(`/account/validate-invite/${token}`);
    return response.data;
  }

  // Team/Hierarchy
  async getDownline() {
    const response = await apiClient.get('/team/downline');
    return response.data;
  }

  async getDownlineUserStats(userId: string) {
    const response = await apiClient.get(`/team/downline/${userId}/stats`);
    return response.data;
  }

  async getTeamStats() {
    const response = await apiClient.get('/team/stats');
    return response.data;
  }

  async assignAgentToManager(agentId: string, managerId: string) {
    const response = await apiClient.post(`/team/assign-agent?agent_id=${agentId}&manager_id=${managerId}`);
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

  async createLead(data: { name: string; phone?: string; email?: string; address?: string; notes?: string; source?: string; status?: string }) {
    const response = await apiClient.post('/leads', data);
    return response.data;
  }

  // Offline-safe lead creation with idempotency via temp_id
  async createLeadOffline(data: { 
    name: string; 
    phone?: string; 
    email?: string; 
    address?: string; 
    notes?: string; 
    source?: string;
    temp_id: string;  // Required for duplicate prevention
  }) {
    const response = await apiClient.post('/leads/offline', data);
    return response.data;
  }

  async updateLead(id: string, data: Partial<{ name: string; phone: string; email: string; address: string; notes: string; status: string }>) {
    const response = await apiClient.put(`/leads/${id}`, data);
    return response.data;
  }

  // Offline-safe lead update with conflict detection
  async updateLeadOffline(id: string, data: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    stage?: string;
    temp_id: string;              // Required for tracking
    offline_timestamp: string;    // When the edit was made offline
  }) {
    const response = await apiClient.put(`/leads/${id}/offline`, data);
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
  async createScope(data: { 
    lead_id: string; 
    form_fields: Record<string, any>; 
    typed_name: string; 
    signature: string;
    agent_typed_name?: string;
    agent_signature?: string;
  }) {
    const response = await apiClient.post('/scope', data);
    return response.data;
  }

  async getScope(scopeId: string) {
    const response = await apiClient.get(`/scope/${scopeId}`);
    return response.data;
  }

  async getLeadScopes(leadId: string) {
    const response = await apiClient.get(`/scope/lead/${leadId}`);
    return response.data;
  }

  async getScopePdf(scopeId: string) {
    const response = await apiClient.get(`/scope/${scopeId}/pdf`);
    return response.data;
  }

  async generateScopePdf(scopeId: string) {
    // Generate the stamped PDF using the EXACT original PDF form on the backend
    // This fills form fields and stamps signatures onto the original document
    const response = await apiClient.post(`/scope/${scopeId}/generate-pdf`);
    return response.data;
  }

  async getAllScopes(skip: number = 0, limit: number = 50) {
    const response = await apiClient.get(`/scope/admin/all?skip=${skip}&limit=${limit}`);
    return response.data;
  }

  async logScopeDelivery(scopeId: string, data: {
    delivery_method: string;
    recipient_contact?: string;
    notes?: string;
  }) {
    const response = await apiClient.post(`/scope/${scopeId}/log-delivery`, {
      scope_id: scopeId,
      ...data
    });
    return response.data;
  }

  async getScopeDeliveryHistory(scopeId: string) {
    const response = await apiClient.get(`/scope/${scopeId}/delivery-history`);
    return response.data;
  }

  // Production
  async createProduction(data: { lead_id?: string; policy_type: string; premium: number; commission: number; carrier: string; policy_number?: string; status?: string; notes?: string }) {
    const response = await apiClient.post('/production', data);
    return response.data;
  }

  async getProduction() {
    const response = await apiClient.get('/production');
    return response.data;
  }

  async getProductionSummary(period: 'day' | 'week' | 'month' = 'month') {
    const response = await apiClient.get(`/production/summary?period=${period}`);
    return response.data;
  }

  async getProductionDashboard() {
    const response = await apiClient.get('/production/dashboard');
    return response.data;
  }

  // Activity
  async getActivity(limit: number = 50) {
    const response = await apiClient.get(`/activity?limit=${limit}`);
    return response.data;
  }

  // AI Coach
  async sendChatMessage(message: string, leadContext?: string, leadId?: string) {
    const response = await apiClient.post('/ai/chat', { 
      message, 
      lead_context: leadContext,
      lead_id: leadId
    });
    return response.data;
  }

  async getLeadSuggestions(leadId: string) {
    const response = await apiClient.post(`/ai/appointment-prep/${leadId}`);
    return response.data;
  }

  async getChatHistory() {
    const response = await apiClient.get('/ai/chat-history');
    // Handle both old (array) and new (object with messages) response formats
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data.messages || [];
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
    const response = await apiClient.post('/routes/geocode', { lead_id: leadId });
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

  // Legal/Compliance
  async getPrivacyPolicy() {
    const response = await apiClient.get('/legal/privacy-policy');
    return response.data;
  }

  async getTermsOfUse() {
    const response = await apiClient.get('/legal/terms');
    return response.data;
  }

  async getDataDisclosure() {
    const response = await apiClient.get('/legal/data-disclosure');
    return response.data;
  }

  // Pipeline API
  async getPipeline(teamView: boolean = false) {
    const response = await apiClient.get(`/pipeline?team_view=${teamView}`);
    return response.data;
  }

  async movePipelineCase(data: {
    lead_id: string;
    new_stage: string;
    notes?: string;
    premium?: number;
    commission?: number;
    policy_type?: string;
  }) {
    const response = await apiClient.put('/pipeline/move', data);
    return response.data;
  }

  async getPipelineStats(teamView: boolean = false) {
    const response = await apiClient.get(`/pipeline/stats?team_view=${teamView}`);
    return response.data;
  }

  // Commission Tracking
  async getCommissions(status?: string, teamView: boolean = false) {
    let url = `/commissions?team_view=${teamView}`;
    if (status) {
      url += `&status=${status}`;
    }
    const response = await apiClient.get(url);
    return response.data;
  }

  async createCommission(data: {
    lead_id?: string;
    production_id?: string;
    policy_type: string;
    carrier: string;
    premium: number;
    estimated_commission: number;
    commission_status?: string;
    notes?: string;
  }) {
    const response = await apiClient.post('/commissions', data);
    return response.data;
  }

  async getCommission(commissionId: string) {
    const response = await apiClient.get(`/commissions/${commissionId}`);
    return response.data;
  }

  async updateCommission(commissionId: string, data: {
    commission_status?: string;
    paid_amount?: number;
    payment_date?: string;
    notes?: string;
  }) {
    const response = await apiClient.put(`/commissions/${commissionId}`, data);
    return response.data;
  }

  async getCommissionSummary(teamView: boolean = false) {
    const response = await apiClient.get(`/commissions/summary/totals?team_view=${teamView}`);
    return response.data;
  }

  async getAgentCommissions(agentId: string) {
    const response = await apiClient.get(`/commissions/agent/${agentId}`);
    return response.data;
  }

  // Command Center (Admin/Manager)
  async getTeamAgents() {
    const response = await apiClient.get('/team/agents');
    return response.data;
  }

  async getAgentDetails(agentId: string) {
    const response = await apiClient.get(`/team/agents/${agentId}/details`);
    return response.data;
  }

  async getTeamSnapshot() {
    const response = await apiClient.get('/team/snapshot');
    return response.data;
  }

  async getTeamLeaderboard(period: 'day' | 'week' | 'month' = 'month') {
    const response = await apiClient.get(`/team/leaderboard?period=${period}`);
    return response.data;
  }

  // Territory Management
  async getTerritories() {
    const response = await apiClient.get('/territories');
    return response.data;
  }

  async getTerritory(territoryId: string) {
    const response = await apiClient.get(`/territories/${territoryId}`);
    return response.data;
  }

  async createTerritory(data: {
    name: string;
    description?: string;
    geographic_type: string;
    zip_codes?: string[];
    cities?: string[];
    counties?: string[];
    states?: string[];
    custom_areas?: string[];
    assigned_agents?: string[];
  }) {
    const response = await apiClient.post('/territories', data);
    return response.data;
  }

  async updateTerritory(territoryId: string, data: any) {
    const response = await apiClient.put(`/territories/${territoryId}`, data);
    return response.data;
  }

  async deleteTerritory(territoryId: string) {
    const response = await apiClient.delete(`/territories/${territoryId}`);
    return response.data;
  }

  // Lead Distribution
  async getUnassignedLeads() {
    const response = await apiClient.get('/lead-distribution/unassigned');
    return response.data;
  }

  async getLeadAssignments() {
    const response = await apiClient.get('/lead-distribution/assignments');
    return response.data;
  }

  async assignLead(leadId: string, agentId: string, notes?: string) {
    const response = await apiClient.post('/lead-distribution/assign', {
      lead_id: leadId,
      agent_id: agentId,
      notes,
    });
    return response.data;
  }

  async bulkAssignLeads(leadIds: string[], agentId: string) {
    const response = await apiClient.post('/lead-distribution/bulk-assign', {
      lead_ids: leadIds,
      agent_id: agentId,
    });
    return response.data;
  }

  async autoDistributeLeads(leadIds: string[], agentIds: string[], method: string = 'round_robin') {
    const response = await apiClient.post('/lead-distribution/auto-distribute', {
      lead_ids: leadIds,
      agent_ids: agentIds,
      method,
    });
    return response.data;
  }

  async bulkUploadLeads(leads: any[], autoAssign: boolean = false, territoryBased: boolean = false) {
    const response = await apiClient.post('/lead-distribution/bulk-upload', {
      leads,
      auto_assign: autoAssign,
      territory_based: territoryBased,
    });
    return response.data;
  }

  async reassignLead(leadId: string, newAgentId: string, reason?: string) {
    const response = await apiClient.post('/lead-distribution/reassign', {
      lead_id: leadId,
      new_agent_id: newAgentId,
      reason,
    });
    return response.data;
  }

  // AI Daily Planner
  async getDailyPlanner() {
    const response = await apiClient.get('/daily-planner');
    return response.data;
  }

  async completePlannerAction(actionType: string, recordId: string, leadId?: string, notes?: string) {
    const response = await apiClient.post('/daily-planner/complete-action', {
      action_type: actionType,
      record_id: recordId,
      lead_id: leadId,
      notes,
    });
    return response.data;
  }

  async getTeamPlannerSummary() {
    const response = await apiClient.get('/daily-planner/team-summary');
    return response.data;
  }

  // Team Tree View
  async getTeamTree() {
    const response = await apiClient.get('/team/tree');
    return response.data;
  }

  async getTeamTreeNode(userId: string) {
    const response = await apiClient.get(`/team/tree/${userId}`);
    return response.data;
  }

  // ==================== AGENCY COMMAND CENTER ====================
  
  async getAgencyCommandCenterSummary() {
    const response = await apiClient.get('/agency-command-center/summary');
    return response.data;
  }

  async getAgencyTeamPerformance() {
    const response = await apiClient.get('/agency-command-center/team-performance');
    return response.data;
  }

  async getAgencyPipelineHealth() {
    const response = await apiClient.get('/agency-command-center/pipeline-health');
    return response.data;
  }

  async getAgencyActivityTracking() {
    const response = await apiClient.get('/agency-command-center/activity-tracking');
    return response.data;
  }

  async getAgencyCommandCenterFull() {
    const response = await apiClient.get('/agency-command-center/full');
    return response.data;
  }

  // ==================== NEEDS ATTENTION / COACHING ALERTS ====================
  
  async getNeedsAttentionAlerts() {
    const response = await apiClient.get('/needs-attention');
    return response.data;
  }

  async getNeedsAttentionCategory(category: string) {
    const response = await apiClient.get(`/needs-attention/category/${category}`);
    return response.data;
  }

  async getNeedsAttentionSummary() {
    const response = await apiClient.get('/needs-attention/summary');
    return response.data;
  }

  // ==================== SMART LEAD DISTRIBUTION ====================

  async getDistributionSummary() {
    const response = await apiClient.get('/smart-distribution/summary');
    return response.data;
  }

  async getAgentPerformanceMetrics() {
    const response = await apiClient.get('/smart-distribution/agents');
    return response.data;
  }

  async smartDistributeLeads(data: {
    lead_ids: string[];
    method: string;
    target_agent_ids?: string[];
    manager_id?: string;
    respect_territories?: boolean;
    balance_workload?: boolean;
  }) {
    const response = await apiClient.post('/smart-distribution/distribute', data);
    return response.data;
  }

  async getLeadActivityHistory(leadId: string) {
    const response = await apiClient.get(`/smart-distribution/activity/${leadId}`);
    return response.data;
  }

  async logLeadActivity(data: {
    lead_id: string;
    activity_type: string;
    description: string;
    old_value?: string;
    new_value?: string;
  }) {
    const response = await apiClient.post('/smart-distribution/activity', data);
    return response.data;
  }

  // ==================== MEDICARE COMPLIANCE TRACKING ====================

  async getComplianceSummary() {
    const response = await apiClient.get('/compliance/summary');
    return response.data;
  }

  async getComplianceRecords(status?: string, limit?: number) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit.toString());
    const response = await apiClient.get(`/compliance/records?${params.toString()}`);
    return response.data;
  }

  async getLeadComplianceStatus(leadId: string) {
    const response = await apiClient.get(`/compliance/lead/${leadId}`);
    return response.data;
  }

  async getAppointmentComplianceStatus(appointmentId: string) {
    const response = await apiClient.get(`/compliance/appointment/${appointmentId}`);
    return response.data;
  }

  async getComplianceDashboardCards() {
    const response = await apiClient.get('/compliance/dashboard-cards');
    return response.data;
  }

  // ==================== NOTIFICATIONS ====================

  async registerPushToken(pushToken: string, deviceType: string = 'ios') {
    const response = await apiClient.post('/notifications/register-push-token', {
      push_token: pushToken,
      device_type: deviceType
    });
    return response.data;
  }

  async getNotificationPreferences() {
    const response = await apiClient.get('/notifications/preferences');
    return response.data;
  }

  async updateNotificationPreferences(preferences: {
    appointments?: boolean;
    reminders?: boolean;
    follow_ups?: boolean;
    team_alerts?: boolean;
    lead_alerts?: boolean;
    push_enabled?: boolean;
  }) {
    const response = await apiClient.put('/notifications/preferences', preferences);
    return response.data;
  }

  async getNotifications(limit: number = 50, unreadOnly: boolean = false) {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (unreadOnly) params.append('unread_only', 'true');
    const response = await apiClient.get(`/notifications?${params.toString()}`);
    return response.data;
  }

  async getUnreadNotificationCount() {
    const response = await apiClient.get('/notifications/unread-count');
    return response.data;
  }

  async markNotificationRead(notificationId: string) {
    const response = await apiClient.put(`/notifications/${notificationId}/read`);
    return response.data;
  }

  async markAllNotificationsRead() {
    const response = await apiClient.put('/notifications/mark-all-read');
    return response.data;
  }

  async deleteNotification(notificationId: string) {
    const response = await apiClient.delete(`/notifications/${notificationId}`);
    return response.data;
  }

  async sendTestNotification() {
    const response = await apiClient.post('/notifications/test');
    return response.data;
  }

  // ==================== ROUTE VISIBILITY ====================

  async getRouteVisibility() {
    const response = await apiClient.get('/routes/visibility');
    return response.data;
  }

  async updateRouteVisibility(visibilityLevel: 'private' | 'summary' | 'shared') {
    const response = await apiClient.put('/routes/visibility', {
      visibility_level: visibilityLevel
    });
    return response.data;
  }

  async getAgentRoute(agentId: string, date: string) {
    const response = await apiClient.get(`/routes/agent/${agentId}?date=${date}`);
    return response.data;
  }

  // ==================== INVITE LINK SYSTEM ====================

  async createInviteLink(role: 'manager' | 'agent', email?: string, name?: string) {
    const response = await apiClient.post('/invitations', {
      role,
      email,
      name
    });
    return response.data;
  }

  // Note: getInvitations() is defined earlier in the INVITATION MANAGEMENT section

  async validateInviteLink(token: string) {
    const response = await apiClient.get(`/invitations/validate/${token}`);
    return response.data;
  }

  async acceptInviteLink(data: {
    token: string;
    email?: string;
    password?: string;
    name?: string;
    is_existing_user?: boolean;
  }) {
    const response = await apiClient.post('/invitations/accept', data);
    return response.data;
  }

  async revokeInvitation(inviteId: string) {
    const response = await apiClient.post(`/invitations/${inviteId}/revoke`);
    return response.data;
  }

  // Note: resendInvitation and deleteInvitation are defined in INVITATION MANAGEMENT section above

  // ==================== MANAGER DAILY COMMAND CENTER ====================

  async getManagerDailyCommandCenter() {
    const response = await apiClient.get('/manager/daily-command-center');
    return response.data;
  }

  // ==================== PROFILE IMAGE ====================

  async uploadProfileImage(imageData: string) {
    const response = await apiClient.post('/auth/profile-image', { image_data: imageData });
    return response.data;
  }

  async deleteProfileImage() {
    const response = await apiClient.delete('/auth/profile-image');
    return response.data;
  }

  async getUserProfileImage(userId: string) {
    const response = await apiClient.get(`/users/${userId}/profile-image`);
    return response.data;
  }
}

export const api = new ApiService();
