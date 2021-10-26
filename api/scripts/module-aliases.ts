import moduleAlias from "module-alias";
moduleAlias.addAliases({
  "@": __dirname,
  "@typedefs": __dirname + "/../../types",
  "@api": __dirname + "/../api",
  "@models": __dirname + "/../models",
  "@config": __dirname + "/../config.js",
  "@log": __dirname + "/../logging.js",
  "@schemas": __dirname + "/../../types/jsonSchemas",
});

export default {};
