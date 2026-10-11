import type { PrismaClient } from "@aios/data";

import type { EventPublisher } from "../outbox/contracts";
import type { JobsLogger } from "../outbox/publisher";
import type { RealtimeBroadcastSink } from "./contracts";
import { DurableGraphRealtimeMapper } from "./mapper";

/** Durable outbox publisher that exposes only validated, owner-scoped graph events. */
export class GraphRealtimeOutboxPublisher implements EventPublisher {
  private readonly mapper: DurableGraphRealtimeMapper;

  constructor(
    database: PrismaClient,
    private readonly sink: RealtimeBroadcastSink,
    private readonly logger?: JobsLogger,
  ) {
    this.mapper = new DurableGraphRealtimeMapper(database);
  }

  async publish(event: Parameters<EventPublisher["publish"]>[0], context: Parameters<EventPublisher["publish"]>[1]): Promise<void> {
    const messages = await this.mapper.map(event);
    for (const message of messages) {
      await this.sink.broadcast(message, context);
      this.logger?.({
        component: "realtime",
        message: "Private graph event published.",
        outboxEventId: event.id,
        realtimeEventId: message.event.eventId,
        realtimeEvent: message.event.event,
        realtimeChannel: message.event.channel,
        private: true,
      });
    }
  }
}
