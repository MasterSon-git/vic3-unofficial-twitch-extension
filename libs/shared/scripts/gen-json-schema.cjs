const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { zodToJsonSchema } = require("zod-to-json-schema");

// import compiled JS to avoid TS runtime
const { SnapshotZ } = require("../dist/schema/snapshot.js");
const { BootstrapZ } = require("../dist/schema/bootstrap.js");

const root = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://vic3-unofficial-twitch/schema.json",
  title: "Vic3 Shared Schemas",
  type: "object",
  properties: {
    Snapshot: zodToJsonSchema(SnapshotZ, "Snapshot"),
    Bootstrap: zodToJsonSchema(BootstrapZ, "Bootstrap")
  },
  required: ["Snapshot", "Bootstrap"]
};

const outPath = join(__dirname, "..", "dist", "schema.json");
writeFileSync(outPath, JSON.stringify(root, null, 2), "utf8");
console.log("Wrote JSON schema to", outPath);
