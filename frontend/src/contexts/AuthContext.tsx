import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await storage.getItem('auth_token');
      if (storedToken) {
        setToken(storedToken);
        api.setAuthToken(storedToken);
        const userData = await api.getMe();
        setUser(userData);
        
        // Load account mode info
        try {
          const modeData = await api.getAccountMode();
          if (modeData.team_info) {
            setTeamInfo(modeData.team_info);
          }
        } catch (e) {
          // Account mode endpoint may not exist for older backends
        }
      }
    } catch (error) {
      console.log('Auth load error:', error);
      try {
        await storage.removeItem('auth_token');
      } catch (e) {
        // Ignore cleanup errors
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
        
        // Refresh team info
        try {
          const modeData = await api.getAccountMode();
          setTeamInfo(modeData.team_info || null);
        } catch (e) {
          // Ignore
        }
      } catch (error) {
        console.log('Refresh user error:', error);
      }
    }
  };

  const signIn = async (email: string, password: string): Promise<User> => {
    const response = await api.login(email, password);
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

  const signUp = async (name: string, email: string, password: string, inviteToken?: string) => {
    const response = await api.register(name, email, password, inviteToken);
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
    setToken(null);
    setUser(null);
    setTeamInfo(null);
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
