import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { api, createApiError, ApiError } from '../services/api';
import NetInfo from '@react-native-community/netinfo';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'agent';
  manager_id?: string;
  admin_id?: string;
  organization_id?: string;
  subscription_status: string;
  created_at: string;
  last_login?: string;
  phone?: string;
  profile_image?: string;
  is_active?: boolean;
  approval_status?: string;
  account_mode?: 'solo' | 'connected';
  organization_name?: string;
  upline_name?: string;
  joined_team_at?: string;
}

interface TeamInfo {
  organization_id: string;
  organization_name: string;
  admin_id?: string;
  admin_name?: string;
  manager_id?: string;
  manager_name?: string;
  upline_name?: string;
  joined_at?: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isOffline: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isAgent: boolean;
  canViewDownline: boolean;
  canInviteUsers: boolean;
  canManageUsers: boolean;
  isSoloMode: boolean;
  isConnectedMode: boolean;
  teamInfo: TeamInfo | null;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string, inviteToken?: string) => Promise<void>;
  createOrganization: (organizationName: string, name: string, email: string, password: string, phone?: string) => Promise<User>;
  registerSolo: (name: string, email: string, password: string, phone?: string) => Promise<User>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ dev_token?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string; profile_image?: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
  joinTeam: (token: string) => Promise<void>;
  leaveTeam: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache keys for offline data
const CACHE_KEYS = {
  USER_DATA: '@cached_user_data',
  TEAM_INFO: '@cached_team_info',
};

// Platform-aware storage
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

// Helper to cache user data for offline use
async function cacheUserData(user: User | null, teamInfo: TeamInfo | null) {
  try {
    if (user) {
      await AsyncStorage.setItem(CACHE_KEYS.USER_DATA, JSON.stringify(user));
    }
    if (teamInfo) {
      await AsyncStorage.setItem(CACHE_KEYS.TEAM_INFO, JSON.stringify(teamInfo));
    }
  } catch (e) {
    // Ignore cache errors
  }
}

// Helper to load cached user data
async function loadCachedUserData(): Promise<{ user: User | null; teamInfo: TeamInfo | null }> {
  try {
    const userData = await AsyncStorage.getItem(CACHE_KEYS.USER_DATA);
    const teamData = await AsyncStorage.getItem(CACHE_KEYS.TEAM_INFO);
    return {
      user: userData ? JSON.parse(userData) : null,
      teamInfo: teamData ? JSON.parse(teamData) : null
    };
  } catch (e) {
    return { user: null, teamInfo: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      // Check network status first
      const netState = await NetInfo.fetch();
      const hasNetwork = netState.isConnected === true && netState.isInternetReachable !== false;
      
      const storedToken = await storage.getItem('auth_token');
      
      // Only proceed if we have a stored token
      if (!storedToken) {
        // No token - user is not signed in, this is expected
        setIsLoading(false);
        return;
      }
      
      setToken(storedToken);
      api.setAuthToken(storedToken);
      
      if (hasNetwork) {
        // Online: try to fetch fresh user data
        try {
          const userData = await api.getMe();
          setUser(userData);
          setIsOffline(false);
          
          // Load account mode info
          try {
            const modeData = await api.getAccountMode();
            if (modeData.team_info) {
              setTeamInfo(modeData.team_info);
            }
            // Cache the fresh data for offline use
            cacheUserData(userData, modeData.team_info || null);
          } catch (e) {
            // Account mode endpoint may not exist for older backends
          }
        } catch (error: any) {
          // Check if this is a 401 unauthorized - means token is invalid/expired
          const status = error?.response?.status;
          if (status === 401 || status === 403) {
            // Token is invalid or expired - this is expected for logged-out users
            // Silently clear the token and continue as logged-out
            await storage.removeItem('auth_token');
            setToken(null);
            setUser(null);
            api.setAuthToken(null);
            // Don't log this as an error - it's expected behavior
          } else {
            // Other API errors - try cached data
            console.log('[Auth] API unavailable, loading cached data');
            const cached = await loadCachedUserData();
            if (cached.user) {
              setUser(cached.user);
              setTeamInfo(cached.teamInfo);
              setIsOffline(true);
            } else {
              // No cached data - clear token
              await storage.removeItem('auth_token');
              setToken(null);
            }
          }
        }
      } else {
        // Offline: load cached user data
        console.log('[Auth] Offline mode - loading cached data');
        const cached = await loadCachedUserData();
        if (cached.user) {
          setUser(cached.user);
          setTeamInfo(cached.teamInfo);
          setIsOffline(true);
        }
        // Don't clear token if offline - keep session for when online
      }
    } catch (error) {
      // Silently handle any unexpected errors during auth bootstrap
      // Don't log errors for auth state - it's normal for users to not be signed in
      try {
        const cached = await loadCachedUserData();
        if (cached.user) {
          setUser(cached.user);
          setTeamInfo(cached.teamInfo);
          setIsOffline(true);
        }
      } catch (e) {
        // Ignore cache errors
      }
    } finally {
      setIsLoading(false);
    }
  };
        if (cached.user) {
          setUser(cached.user);
          setTeamInfo(cached.teamInfo);
          setIsOffline(true);
        }
      } catch (e) {
        // Ignore
      }
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    if (token) {
      try {
        const userData = await api.getMe();
        setUser(userData);
        setIsOffline(false);
        
        // Refresh team info
        try {
          const modeData = await api.getAccountMode();
          setTeamInfo(modeData.team_info || null);
          // Cache fresh data
          cacheUserData(userData, modeData.team_info || null);
        } catch (e) {
          // Ignore
        }
      } catch (error) {
        console.warn('[Auth] Refresh user error:', error);
        const apiError = createApiError(error);
        if (apiError.isOffline) {
          setIsOffline(true);
        }
      }
    }
  };

  const signIn = async (email: string, password: string): Promise<User> => {
    const response = await api.login(email, password);
    await storage.setItem('auth_token', response.access_token);
    setToken(response.access_token);
    api.setAuthToken(response.access_token);
    setUser(response.user);
    setIsOffline(false);
    
    // Load team info
    try {
      const modeData = await api.getAccountMode();
      setTeamInfo(modeData.team_info || null);
      // Cache for offline use
      cacheUserData(response.user, modeData.team_info || null);
    } catch (e) {
      // Cache user without team info
      cacheUserData(response.user, null);
    }
    
    return response.user;
  };

  const signUp = async (name: string, email: string, password: string, inviteToken?: string) => {
    const response = await api.register(name, email, password, inviteToken);
    await storage.setItem('auth_token', response.access_token);
    setToken(response.access_token);
    api.setAuthToken(response.access_token);
    setUser(response.user);
    setIsOffline(false);
    
    // Load team info
    try {
      const modeData = await api.getAccountMode();
      setTeamInfo(modeData.team_info || null);
      cacheUserData(response.user, modeData.team_info || null);
    } catch (e) {
      cacheUserData(response.user, null);
    }
  };

  const createOrganization = async (
    organizationName: string,
    name: string,
    email: string,
    password: string,
    phone?: string
  ): Promise<User> => {
    const response = await api.createOrganization(organizationName, name, email, password, phone);
    await storage.setItem('auth_token', response.access_token);
    setToken(response.access_token);
    api.setAuthToken(response.access_token);
    setUser(response.user);
    
    // Load team info
    try {
      const modeData = await api.getAccountMode();
      setTeamInfo(modeData.team_info || null);
    } catch (e) {
      // Ignore
    }
    
    return response.user;
  };

  const registerSolo = async (
    name: string,
    email: string,
    password: string,
    phone?: string
  ): Promise<User> => {
    const response = await api.registerSolo(name, email, password, phone);
    await storage.setItem('auth_token', response.access_token);
    setToken(response.access_token);
    api.setAuthToken(response.access_token);
    setUser(response.user);
    setTeamInfo(null); // Solo mode has no team
    
    return response.user;
  };

  const signOut = async () => {
    await storage.removeItem('auth_token');
    // Clear cached user data on logout
    try {
      await AsyncStorage.removeItem(CACHE_KEYS.USER_DATA);
      await AsyncStorage.removeItem(CACHE_KEYS.TEAM_INFO);
    } catch (e) {
      // Ignore cache clear errors
    }
    setToken(null);
    setUser(null);
    setTeamInfo(null);
    setIsOffline(false);
    api.setAuthToken(null);
  };

  const forgotPassword = async (email: string) => {
    return await api.forgotPassword(email);
  };

  const resetPassword = async (token: string, newPassword: string) => {
    await api.resetPassword(token, newPassword);
  };

  const updateProfile = async (data: { name?: string; phone?: string; profile_image?: string }) => {
    const updatedUser = await api.updateProfile(data);
    setUser(updatedUser);
  };

  const deleteAccount = async () => {
    await api.deleteAccount();
    await signOut();
  };

  const joinTeam = async (inviteToken: string) => {
    const result = await api.joinTeam(inviteToken);
    // Refresh user data to get updated role/organization
    await refreshUser();
    return result;
  };

  const leaveTeam = async () => {
    const result = await api.leaveTeam();
    // Refresh user data
    await refreshUser();
    return result;
  };

  // Role-based access helpers
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isAgent = user?.role === 'agent';
  const canViewDownline = isAdmin || isManager;
  const canInviteUsers = isAdmin || isManager;
  const canManageUsers = isAdmin;
  
  // Account mode helpers
  const isSoloMode = !user?.organization_id;
  const isConnectedMode = !!user?.organization_id;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isOffline,
        isAdmin,
        isManager,
        isAgent,
        canViewDownline,
        canInviteUsers,
        canManageUsers,
        isSoloMode,
        isConnectedMode,
        teamInfo,
        signIn,
        signUp,
        createOrganization,
        registerSolo,
        signOut,
        forgotPassword,
        resetPassword,
        updateProfile,
        deleteAccount,
        refreshUser,
        joinTeam,
        leaveTeam,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
