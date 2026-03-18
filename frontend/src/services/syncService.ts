import { offlineStorage, PendingLeadChange, SyncStatus } from './offlineStorage';
import { api } from './api';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 10000]; // Exponential backoff: 1s, 3s, 10s

type SyncListener = (status: SyncServiceStatus) => void;

export interface SyncServiceStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  lastError: string | null;
  currentItem: PendingLeadChange | null;
}

class SyncService {
  private isSyncing = false;
  private listeners: Set<SyncListener> = new Set();
  private status: SyncServiceStatus = {
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    lastError: null,
    currentItem: null,
  };

  // Subscribe to sync status changes
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.status); // Immediately send current status
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.status));
  }

  private updateStatus(updates: Partial<SyncServiceStatus>): void {
    this.status = { ...this.status, ...updates };
    this.notifyListeners();
  }

  // Trigger sync (called when connection is restored)
  async triggerSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[SyncService] Sync already in progress, skipping');
      return;
    }

    const pendingChanges = await offlineStorage.getPendingChanges();
    const toSync = pendingChanges.filter(
      c => c.syncStatus === 'pending' || (c.syncStatus === 'failed' && c.retryCount < MAX_RETRIES)
    );

    if (toSync.length === 0) {
      console.log('[SyncService] No pending changes to sync');
      this.updateStatus({ pendingCount: 0 });
      return;
    }

    console.log(`[SyncService] Starting sync of ${toSync.length} items`);
    this.isSyncing = true;
    this.updateStatus({ isSyncing: true, pendingCount: toSync.length });

    // Sort by timestamp (FIFO - oldest first)
    toSync.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    for (const change of toSync) {
      await this.syncItem(change);
    }

    this.isSyncing = false;
    const remainingCount = await offlineStorage.getPendingCount();
    this.updateStatus({
      isSyncing: false,
      pendingCount: remainingCount,
      lastSyncTime: new Date(),
      currentItem: null,
    });

    console.log('[SyncService] Sync complete');
  }

  private async syncItem(change: PendingLeadChange): Promise<boolean> {
    this.updateStatus({ currentItem: change });
    
    try {
      // Mark as syncing
      await offlineStorage.updateSyncStatus(change.tempId, 'syncing');

      if (change.action === 'create') {
        await this.syncCreate(change);
      } else if (change.action === 'update') {
        await this.syncUpdate(change);
      }

      // Success - remove from queue
      await offlineStorage.removeSyncedChange(change.tempId);
      console.log(`[SyncService] Successfully synced: ${change.tempId}`);
      return true;

    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || error?.message || 'Unknown error';
      console.error(`[SyncService] Failed to sync ${change.tempId}:`, errorMessage);

      // Check if this is a duplicate error (lead already exists)
      if (error?.response?.status === 409 || errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        // This is expected for duplicate prevention - consider it synced
        console.log(`[SyncService] Lead already exists (duplicate prevented): ${change.tempId}`);
        await offlineStorage.removeSyncedChange(change.tempId);
        return true;
      }

      // Mark as failed
      await offlineStorage.updateSyncStatus(change.tempId, 'failed', errorMessage);
      this.updateStatus({ lastError: errorMessage });

      // If retries remaining, schedule retry with backoff
      if (change.retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[Math.min(change.retryCount, RETRY_DELAYS.length - 1)];
        console.log(`[SyncService] Will retry ${change.tempId} in ${delay}ms (attempt ${change.retryCount + 1}/${MAX_RETRIES})`);
        setTimeout(() => this.retryItem(change.tempId), delay);
      }

      return false;
    }
  }

  private async syncCreate(change: PendingLeadChange): Promise<void> {
    // Use the idempotent create endpoint with tempId
    const response = await api.createLeadOffline({
      ...change.data,
      temp_id: change.tempId,
    });
    console.log(`[SyncService] Created lead: ${response.id} (tempId: ${change.tempId})`);
  }

  private async syncUpdate(change: PendingLeadChange): Promise<void> {
    if (!change.leadId) {
      throw new Error('Lead ID required for update');
    }

    // Use safe update with conflict detection
    await api.updateLeadOffline(change.leadId, {
      ...change.data,
      temp_id: change.tempId,
      offline_timestamp: change.timestamp,
    });
    console.log(`[SyncService] Updated lead: ${change.leadId}`);
  }

  private async retryItem(tempId: string): Promise<void> {
    const changes = await offlineStorage.getPendingChanges();
    const change = changes.find(c => c.tempId === tempId);
    
    if (change && change.syncStatus === 'failed') {
      console.log(`[SyncService] Retrying: ${tempId}`);
      await this.syncItem(change);
    }
  }

  // Get current sync status
  getStatus(): SyncServiceStatus {
    return this.status;
  }

  // Manual sync trigger (for refresh button)
  async manualSync(): Promise<void> {
    await this.triggerSync();
  }
}

export const syncService = new SyncService();
