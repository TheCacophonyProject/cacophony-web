// Regenerates classifications/label_paths.json from classifications/classification.json.
//
// Each label maps to an ltree path built from its position in the classification tree:
// lower case, spaces replaced with underscores, and any other character that isn't
// allowed in an ltree label (a-z, 0-9, _) removed. eg. "hochstetter's frog" ->
// "all.other.frog.hochstetters_frog".
//
// Aliases map to the same path as the label they are an alias of, eg. "rooster" ->
// "all.bird.chicken", so server-side queries group them with that label.
//
// Existing key order is preserved and new labels are appended, to keep diffs small.
// Keys in label_paths.json that aren't in the classification tree (legacy labels)
// are kept as-is.
//
// Usage: node scripts/generate-label-paths.mjs [--check]
//   --check  Don't write anything; exit 1 if label_paths.json is out of date.

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const classificationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "classifications",
);
const classificationPath = join(classificationsDir, "classification.json");
const labelPathsPath = join(classificationsDir, "label_paths.json");

const toPathSegment = (label) =>
  label
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/[^a-z0-9_]/g, "");

const buildPaths = (node, parentPath, acc, aliases) => {
  const label = node.label.toLowerCase();
  const path = parentPath
    ? `${parentPath}.${toPathSegment(label)}`
    : toPathSegment(label);
  if (label in acc && acc[label] !== path) {
    throw new Error(
      `Label "${label}" appears twice with different paths: ${acc[label]} and ${path}`,
    );
  }
  acc[label] = path;
  for (const alias of node.aliases || []) {
    aliases.push({ alias: alias.toLowerCase(), label, path });
  }
  for (const child of node.children || []) {
    buildPaths(child, path, acc, aliases);
  }
  return acc;
};

const tree = JSON.parse(readFileSync(classificationPath, "utf8"));
const aliases = [];
const generated = buildPaths(tree, "", {}, aliases);
for (const { alias, label, path } of aliases) {
  if (alias in generated && generated[alias] !== path) {
    throw new Error(
      `Alias "${alias}" of "${label}" conflicts with existing label path ${generated[alias]}`,
    );
  }
  generated[alias] = path;
}
const existing = JSON.parse(readFileSync(labelPathsPath, "utf8"));

const result = {};
const changed = [];
const added = [];
const legacy = [];
for (const [label, path] of Object.entries(existing)) {
  if (label in generated) {
    result[label] = generated[label];
    if (generated[label] !== path) {
      changed.push(`${label}: ${path} -> ${generated[label]}`);
    }
  } else {
    result[label] = path;
    legacy.push(`${label}: ${path}`);
  }
}
for (const [label, path] of Object.entries(generated)) {
  if (!(label in result)) {
    result[label] = path;
    added.push(`${label}: ${path}`);
  }
}

const report = (title, items) => {
  if (items.length) {
    console.log(`${title} (${items.length}):`);
    for (const item of items) {
      console.log(`  ${item}`);
    }
  }
};
report("Changed", changed);
report("Added", added);
report("Kept legacy labels not in classification.json", legacy);

const outOfDate = changed.length > 0 || added.length > 0;
if (process.argv.includes("--check")) {
  if (outOfDate) {
    console.error("label_paths.json is out of date");
    process.exit(1);
  }
  console.log("label_paths.json is up to date");
} else if (outOfDate) {
  writeFileSync(labelPathsPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`Wrote ${labelPathsPath}`);
} else {
  console.log("label_paths.json is already up to date");
}
