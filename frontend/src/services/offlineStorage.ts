import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

// Storage keys
const OFFLINE_LEADS_KEY = '@offline_leads';
const SYNC_QUEUE_KEY = '@sync_queue';
const MAX_QUEUE_SIZE = 50; // Prevent memory bloat

// Types
export type SyncAction = 'create' | 'update';
export type SyncStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export interface OfflineLeadData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  source?: string;
  stage?: string;
  referral_source?: string;
  next_follow_up?: string;
  renewal_date?: string;
}

export interface PendingLeadChange {
  tempId: string;           // Unique ID for deduplication
  leadId?: string;          // Server ID (only for updates)
  action: SyncAction;
  data: OfflineLeadData;
  timestamp: string;        // ISO date when change was made
  syncStatus: SyncStatus;
  retryCount: number;
  lastError?: string;
}

class OfflineStorageService {
  private isInitialized = false;

  // Generate unique temporary ID
  generateTempId(): string {
    return `temp_${uuidv4()}_${Date.now()}`;
  }

  // Get all pending changes
  async getPendingChanges(): Promise<PendingLeadChange[]> {
    try {
      const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error) {
      console.error('[OfflineStorage] Failed to get pending changes:', error);
      return [];
    }
  }

  // Save pending changes
  private async savePendingChanges(changes: PendingLeadChange[]): Promise<void> {
    try {
      // Enforce max queue size - remove oldest synced/failed items first
      if (changes.length > MAX_QUEUE_SIZE) {
        const sortedByPriority = changes.sort((a, b) => {
          // Keep pending items, remove old synced/failed
          if (a.syncStatus === 'pending' && b.syncStatus !== 'pending') return -1;
          if (a.syncStatus !== 'pending' && b.syncStatus === 'pending') return 1;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
        changes = sortedByPriority.slice(0, MAX_QUEUE_SIZE);
      }
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(changes));
    } catch (error) {
      console.error('[OfflineStorage] Failed to save pending changes:', error);
      throw error;
    }
  }

  // Add a new lead creation to queue
  async queueLeadCreate(data: OfflineLeadData): Promise<PendingLeadChange> {
    const tempId = this.generateTempId();
    const change: PendingLeadChange = {
      tempId,
      action: 'create',
      data,
      timestamp: new Date().toISOString(),
      syncStatus: 'pending',
      retryCount: 0,
    };

    const changes = await this.getPendingChanges();
    changes.push(change);
    await this.savePendingChanges(changes);

    console.log('[OfflineStorage] Queued lead creation:', tempId);
    return change;
  }

  // Add a lead update to queue
  async queueLeadUpdate(leadId: string, data: OfflineLeadData): Promise<PendingLeadChange> {
    const tempId = this.generateTempId();
    const change: PendingLeadChange = {
      tempId,
      leadId,
      action: 'update',
      data,
      timestamp: new Date().toISOString(),
      syncStatus: 'pending',
      retryCount: 0,
    };

    const changes = await this.getPendingChanges();
    
    // Check if there's already a pending update for this lead
    const existingIndex = changes.findIndex(
      c => c.leadId === leadId && c.action === 'update' && c.syncStatus === 'pending'
    );
    
    if (existingIndex >= 0) {
      // Merge with existing pending update (keep latest data)
      changes[existingIndex] = {
        ...changes[existingIndex],
        data: { ...changes[existingIndex].data, ...data },
        timestamp: new Date().toISOString(),
      };
      await this.savePendingChanges(changes);
      console.log('[OfflineStorage] Merged lead update:', leadId);
      return changes[existingIndex];
    }

    changes.push(change);
    await this.savePendingChanges(changes);
    console.log('[OfflineStorage] Queued lead update:', leadId);
    return change;
  }

  // Update sync status for a change
  async updateSyncStatus(
    tempId: string, 
    status: SyncStatus, 
    error?: string
  ): Promise<void> {
    const changes = await this.getPendingChanges();
    const index = changes.findIndex(c => c.tempId === tempId);
    
    if (index >= 0) {
      changes[index].syncStatus = status;
      if (error) {
        changes[index].lastError = error;
        changes[index].retryCount += 1;
      }
      await this.savePendingChanges(changes);
    }
  }

  // Remove a synced change from queue
  async removeSyncedChange(tempId: string): Promise<void> {
    const changes = await this.getPendingChanges();
    const filtered = changes.filter(c => c.tempId !== tempId);
    await this.savePendingChanges(filtered);
    console.log('[OfflineStorage] Removed synced change:', tempId);
  }

  // Get pending count
  async getPendingCount(): Promise<number> {
    const changes = await this.getPendingChanges();
    return changes.filter(c => c.syncStatus === 'pending' || c.syncStatus === 'failed').length;
  }

  // Check if a tempId already exists (for duplicate prevention)
  async tempIdExists(tempId: string): Promise<boolean> {
    const changes = await this.getPendingChanges();
    return changes.some(c => c.tempId === tempId);
  }

  // Clear all synced items (cleanup)
  async clearSyncedItems(): Promise<void> {
    const changes = await this.getPendingChanges();
    const pending = changes.filter(c => c.syncStatus !== 'synced');
    await this.savePendingChanges(pending);
  }

  // Clear everything (for testing/debugging)
  async clearAll(): Promise<void> {
    await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
    await AsyncStorage.removeItem(OFFLINE_LEADS_KEY);
    console.log('[OfflineStorage] Cleared all offline data');
  }
}

export const offlineStorage = new OfflineStorageService();
