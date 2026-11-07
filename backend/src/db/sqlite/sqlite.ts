import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

const client = createClient({ url: "file::memory:" });
export const db = drizzle(client);
export const close = async (): Promise<void> => {
  await client.close();
};
