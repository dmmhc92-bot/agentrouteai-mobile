import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  subscription_status: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ dev_token?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token');
      if (storedToken) {
        setToken(storedToken);
        api.setAuthToken(storedToken);
        const userData = await api.getMe();
        setUser(userData);
      }
    } catch (error) {
      console.log('Auth load error:', error);
      await SecureStore.deleteItemAsync('auth_token');
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const response = await api.login(email, password);
    await SecureStore.setItemAsync('auth_token', response.access_token);
    setToken(response.access_token);
    api.setAuthToken(response.access_token);
    setUser(response.user);
  };

  const signUp = async (name: string, email: string, password: string) => {
    const response = await api.register(name, email, password);
    await SecureStore.setItemAsync('auth_token', response.access_token);
    setToken(response.access_token);
    api.setAuthToken(response.access_token);
    setUser(response.user);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync('auth_token');
    setToken(null);
    setUser(null);
    api.setAuthToken(null);
  };

  const forgotPassword = async (email: string) => {
    return await api.forgotPassword(email);
  };

  const resetPassword = async (token: string, newPassword: string) => {
    await api.resetPassword(token, newPassword);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        signIn,
        signUp,
        signOut,
        forgotPassword,
        resetPassword,
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
