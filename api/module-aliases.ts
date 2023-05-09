import moduleAlias from "module-alias";
export default function () {
  moduleAlias.addAliases({
    "@": __dirname,
    "@/*": __dirname + "/*",
    "@typedefs": __dirname + "/../types",
    "@api": __dirname + "/api",
    "@models": __dirname + "/models",
    "@config": __dirname + "/config.js",
    "@log": __dirname + "/logging.js",
    "@schemas": __dirname + "/../types/jsonSchemas",
  });
}
