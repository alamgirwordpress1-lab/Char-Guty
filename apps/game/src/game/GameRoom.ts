/** The slice of a colyseus.js Room the Game scene depends on; also satisfied by the dev mock. */
export interface GameRoom {
  readonly sessionId: string;
  readonly reconnectionToken: string;
  onMessage<T>(type: string, callback: (message: T) => void): unknown;
  onLeave(callback: (code: number, reason?: string) => void): unknown;
  onError(callback: (code: number, message?: string) => void): unknown;
  send(type: string, message?: unknown): void;
  leave(consented?: boolean): Promise<number>;
  removeAllListeners(): void;
}
