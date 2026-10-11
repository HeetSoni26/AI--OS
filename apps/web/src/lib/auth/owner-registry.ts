import "server-only";

import { getDatabaseClient } from "@aios/data";

export async function isActiveRegisteredOwner(authSubject: string, email: string): Promise<boolean> {
  const owner = await getDatabaseClient().ownerAccount.findFirst({
    where: {
      authSubject,
      email: { equals: email, mode: "insensitive" },
      active: true,
    },
    select: { id: true },
  });
  return owner !== null;
}
