type Listener = (payload: unknown) => void;

class RealtimeManager {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  broadcast(payload: unknown) {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}

export const realtime = new RealtimeManager();
