import { StorageService, storageEventTarget, StorageUpdateDetail } from './storage';
import { SupabaseService } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export const syncEventTarget = new EventTarget();

class SyncServiceClass {
  public status: string = 'Offline';
  public isConnected: boolean = false;
  public lastSyncTime: string = '';
  private channel: RealtimeChannel | null = null;
  private ROOM_ID = 'tulika_global_room';
  private presenceInterval: any = null;
  
  private isPartnerPresent = false;
  private amILeader = false;
  private activeSessionId: string | null = null;

  public async init() {
    if (!SupabaseService.init()) {
      this.updateStatus('Offline (Not Configured)');
      return;
    }
    
    this.isConnected = true;
    this.setupRealtimeSubscription();
    this.updateStatus('Connected');
    this.lastSyncTime = new Date().toLocaleTimeString();

    // Heartbeat
    if (this.presenceInterval) clearInterval(this.presenceInterval);
    this.presenceInterval = setInterval(() => {
        if (this.channel && this.isConnected) {
            const profile = StorageService.getCoupleProfile();
            this.channel.track({ 
                user: profile.myName, 
                online_at: new Date().toISOString() 
            });
        }
    }, 5000);

    // BIND LOCAL CHANGES TO CLOUD PUSH
    storageEventTarget.addEventListener('storage-update', (e: any) => {
        const detail = e.detail as StorageUpdateDetail;
        if (detail.source === 'user') {
            this.handleLocalChange(detail);
        } else if (detail.source === 'sync' && detail.action === 'save') {
            // NOTIFICATION TRIGGER: Only for synced items from partner
            this.triggerSystemNotification(detail);
        }
    });

    // Reconcile cloud with protection
    this.reconcileCloud();
  }

  private triggerSystemNotification(detail: StorageUpdateDetail) {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      
      // Don't notify during initial boot/reconciliation to avoid spam
      const profile = StorageService.getCoupleProfile();
      const partner = profile.partnerName;
      
      let title = "Tulika";
      let body = "Something new was added!";
      let icon = "/icon.svg";

      switch (detail.table) {
          case 'memories':
              body = `${partner} shared a new memory in your timeline. ❤️`;
              break;
          case 'daily_photos':
              body = `New Moment! ${partner} posted a disappearing photo. 📸`;
              break;
          case 'envelopes':
              body = `You have a new "Open When" letter from ${partner}. 💌`;
              break;
          case 'notes':
              body = `${partner} left you a love note. 📝`;
              break;
          case 'keepsakes':
              body = `A special gift just arrived in your Keepsake Box! 🎁`;
              break;
          case 'dates':
              body = `${partner} added a new landmark in Downtown. 🏙️`;
              break;
          default:
              return; // Don't notify for profile/status/init/etc
      }

      // Avoid notifying if the app is currently open and active in the foreground
      if (document.visibilityState === 'visible') return;

      try {
          new Notification(title, { body, icon, badge: "/icon.svg" });
      } catch (e) {
          // Fallback for some mobile browsers
          navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(title, { body, icon, badge: "/icon.svg" });
          });
      }
  }

  private async reconcileCloud() {
      try {
          const tables = ['memories', 'notes', 'dates', 'envelopes', 'daily_photos', 'keepsakes', 'dinner_options', 'couple_profile', 'pet_stats', 'together_music'];
          
          for (const table of tables) {
              const cloudItems = await SupabaseService.fetchAll(table);
              
              if (cloudItems.length === 0) {
                  // CLOUD EMPTY PROTECTION: Push local data to cloud instead of pulling
                  if (table === 'couple_profile') {
                      const local = StorageService.getCoupleProfile();
                      await SupabaseService.saveSingle(table, local);
                  } else if (table === 'pet_stats') {
                      const local = StorageService.getPetStats();
                      await SupabaseService.saveSingle(table, local);
                  } else if (table === 'together_music') {
                      const local = await StorageService.getTogetherMusic();
                      const meta = StorageService.getTogetherMusicMetadata();
                      if (local) await SupabaseService.saveSingle(table, { music_base64: local, meta });
                  } else {
                      const listKeyMap: Record<string, any[]> = {
                        memories: StorageService.getMemories(),
                        notes: StorageService.getNotes(),
                        dates: StorageService.getSpecialDates(),
                        envelopes: StorageService.getEnvelopes(),
                        daily_photos: StorageService.getDailyPhotos(),
                        keepsakes: StorageService.getKeepsakes(),
                        dinner_options: StorageService.getDinnerOptions()
                      };
                      const localItems = listKeyMap[table];
                      for (const it of localItems) {
                          await SupabaseService.upsertItem(table, it);
                      }
                  }
              } else {
                  // CLOUD HAS DATA: Pull it down
                  for (const item of cloudItems) {
                      await StorageService.handleCloudUpdate(table, item);
                  }
              }
          }
          this.updateStatus('Cloud Synced');
      } catch (e) {
          console.warn("Reconciliation failed", e);
      }
  }

  private async handleLocalChange(detail: StorageUpdateDetail) {
      if (!this.isConnected) return;
      try {
          if (detail.action === 'save' && detail.item) {
              if (['couple_profile', 'pet_stats', 'together_music'].includes(detail.table)) {
                  await SupabaseService.saveSingle(detail.table, detail.item);
              } else {
                  await SupabaseService.upsertItem(detail.table, detail.item);
              }
          } else if (detail.action === 'delete') {
              await SupabaseService.deleteItem(detail.table, detail.id);
          }
          this.lastSyncTime = new Date().toLocaleTimeString();
          syncEventTarget.dispatchEvent(new Event('sync-update'));
      } catch (e) {
          console.error("Cloud push failed", e);
      }
  }

  private setupRealtimeSubscription() {
      if (!SupabaseService.client) return;
      const profile = StorageService.getCoupleProfile();

      this.channel = SupabaseService.client
        .channel(this.ROOM_ID)
        .on('presence', { event: 'sync' }, () => {
            const state = this.channel?.presenceState();
            this.handlePresenceUpdate(state, profile);
        })
        .on('broadcast', { event: 'session_start' }, (payload) => {
            this.handleIncomingSession(payload.payload);
        })
        .on('broadcast', { event: 'signal' }, (payload) => {
            syncEventTarget.dispatchEvent(new CustomEvent('signal-received', { detail: payload.payload }));
        })
        .subscribe();

      const tables = ['memories', 'notes', 'dates', 'envelopes', 'daily_photos', 'keepsakes', 'dinner_options', 'couple_profile', 'pet_stats', 'user_status', 'together_music'];
      tables.forEach(table => {
          SupabaseService.client?.channel(`public:${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    StorageService.handleCloudUpdate(table, payload.new);
                } else if (payload.eventType === 'DELETE') {
                    StorageService.handleCloudDelete(table, payload.old.id);
                }
            })
            .subscribe();
      });
  }

  private handlePresenceUpdate(state: any, profile: any) {
      let partnerFound = false;
      const users: string[] = [];
      if (state) {
          Object.values(state).forEach((presences: any) => {
              presences.forEach((p: any) => {
                  users.push(p.user);
                  if (p.user === profile.partnerName) partnerFound = true;
              });
          });
      }
      this.isPartnerPresent = partnerFound;
      const sortedUsers = users.sort();
      this.amILeader = sortedUsers[0] === profile.myName;
      if (this.isPartnerPresent && this.amILeader) {
          this.initiateSession();
      } else if (!this.isPartnerPresent) {
          this.endSession();
      }
      syncEventTarget.dispatchEvent(new CustomEvent('presence-update', { detail: state }));
  }

  private initiateSession() {
      if (this.activeSessionId) return;
      const sessionId = Math.random().toString(36).substring(7);
      const startTime = Date.now();
      this.activeSessionId = sessionId;
      this.channel?.send({
          type: 'broadcast',
          event: 'session_start',
          payload: { sessionId, startTime, track: 'together_theme' }
      });
      this.handleIncomingSession({ sessionId, startTime });
  }

  private handleIncomingSession(data: any) {
      this.activeSessionId = data.sessionId;
      syncEventTarget.dispatchEvent(new CustomEvent('together-session-start', { detail: data }));
  }

  private endSession() {
      if (!this.activeSessionId) return;
      this.activeSessionId = null;
      syncEventTarget.dispatchEvent(new Event('together-session-end'));
  }

  public sendSignal(type: string, payload: any = {}) {
      this.channel?.send({ type: 'broadcast', event: 'signal', payload: { signalType: type, payload } });
  }

  private updateStatus(msg: string) {
    this.status = msg;
    syncEventTarget.dispatchEvent(new Event('sync-update'));
  }
}

export const SyncService = new SyncServiceClass();