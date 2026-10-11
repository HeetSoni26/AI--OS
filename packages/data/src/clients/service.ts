import type { PrismaClient } from "../generated/client/client";
import { PrismaClientCommunicationRepository } from "./communication-repository";
import { PrismaClientRepository, type ClientRepositoryOptions } from "./client-repository";
import { PrismaClientWorkRepository } from "./work-repository";

/** Server-side facade over Prisma-backed client-operation repositories. */
export class PrismaClientOperationsService {
  readonly clients: PrismaClientRepository;
  readonly work: PrismaClientWorkRepository;
  readonly communications: PrismaClientCommunicationRepository;

  constructor(database: PrismaClient, options: ClientRepositoryOptions = {}) {
    this.clients = new PrismaClientRepository(database, options);
    this.work = new PrismaClientWorkRepository(database);
    this.communications = new PrismaClientCommunicationRepository(database);
  }
}

export function createClientOperationsService(database: PrismaClient, options: ClientRepositoryOptions = {}): PrismaClientOperationsService {
  return new PrismaClientOperationsService(database, options);
}
