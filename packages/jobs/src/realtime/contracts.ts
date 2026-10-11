import type { GraphRealtimeEvent } from "@aios/contracts";

import type { EventPublishContext } from "../outbox/contracts";

/** A validated graph event plus the authenticated owner whose private topic receives it. */
export interface OwnerScopedRealtimeBroadcast {
  readonly ownerAuthSubject: string;
  readonly event: GraphRealtimeEvent;
}

/** Provider boundary for private server-side realtime broadcasts. */
export interface RealtimeBroadcastSink {
  broadcast(
    message: OwnerScopedRealtimeBroadcast,
    context: EventPublishContext,
  ): Promise<void>;
}
