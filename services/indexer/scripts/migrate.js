import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../src/config.js";
import { createDbPool } from "../src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const pool = createDbPool(config.databaseUrl, { ssl: config.databaseSsl });

  try {
    await pool.query(sql);
    console.log("[migrate] schema applied successfully");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
