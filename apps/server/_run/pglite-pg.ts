// Temporary (not committed): a real Postgres wire-protocol server backed by
// in-process PGlite, standing in for Neon so the app can actually run locally.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = new PGlite();
const server = new PGLiteSocketServer({ db, port: 55432, host: "127.0.0.1", maxConnections: 10 });
await server.start();
console.log("pglite fake-postgres listening on 127.0.0.1:55432");
await new Promise(() => {});
