import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { syncService } from '../services/syncService';

interface NetworkContextType {
  isOnline: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  checkConnection: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    try {
      const state = await NetInfo.fetch();
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
      setLastChecked(new Date());
      return online;
    } catch (error) {
      console.error('Network check failed:', error);
      setIsOnline(false);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkConnection();

    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      const wasOffline = !isOnline;
      
      setIsOnline(online);
      setLastChecked(new Date());

      // If we just came back online, trigger sync
      if (online && wasOffline) {
        console.log('[Network] Connection restored - triggering sync');
        syncService.triggerSync();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [checkConnection, isOnline]);

  return (
    <NetworkContext.Provider value={{ isOnline, isChecking, lastChecked, checkConnection }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextType {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}

export default NetworkContext;
