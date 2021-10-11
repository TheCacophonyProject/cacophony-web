"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_json_schema_generator_1 = require("ts-json-schema-generator");
const promises_1 = __importDefault(require("fs/promises"));
const typescript_1 = __importDefault(require("typescript"));
const crypto_1 = __importDefault(require("crypto"));
const recursive_readdir_1 = __importDefault(require("recursive-readdir"));
class IntegerType extends ts_json_schema_generator_1.FunctionType {
    getId() {
        return "integer";
    }
}
class FloatZeroOneType extends ts_json_schema_generator_1.FunctionType {
    getId() {
        return "FloatZeroToOne";
    }
}
class IsoFormattedDateStringType extends ts_json_schema_generator_1.FunctionType {
    getId() {
        return "IsoFormattedDateString";
    }
}
class IntegerFormatter {
    supportsType(type) {
        return type instanceof IntegerType;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getDefinition(type) {
        // Return a custom schema for the function property.
        return {
            type: "integer",
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildren(type) {
        return [];
    }
}
class IsoFormattedDateStringFormatter {
    supportsType(type) {
        return type instanceof IsoFormattedDateStringType;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getDefinition(type) {
        // Return a custom schema for the function property.
        return {
            type: "string",
            format: "IsoFormattedDateString",
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildren(type) {
        return [];
    }
}
class FloatZeroOneFormatter {
    supportsType(type) {
        return type instanceof FloatZeroOneType;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getDefinition(type) {
        // Return a custom schema for the function property.
        return {
            type: "number",
            format: "FloatZeroOne",
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildren(type) {
        return [];
    }
}
class TypeAliasParser {
    supportsNode(node) {
        if (node.kind === typescript_1.default.SyntaxKind.TypeAliasDeclaration &&
            node.name.escapedText === "integer") {
            return true;
        }
        return false;
    }
    createType(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    node, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    reference) {
        return new IntegerType(); // Treat constructors as strings in this example
    }
}
class FloatZeroOneParser {
    supportsNode(node) {
        if (node.kind === typescript_1.default.SyntaxKind.TypeAliasDeclaration &&
            node.name.escapedText === "FloatZeroToOne") {
            return true;
        }
        return false;
    }
    createType(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    node, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    reference) {
        return new FloatZeroOneType(); // Treat constructors as strings in this example
    }
}
class IsoFormattedDateStringParser {
    supportsNode(node) {
        if (node.kind === typescript_1.default.SyntaxKind.TypeAliasDeclaration &&
            node.name.escapedText === "IsoFormattedDateString") {
            return true;
        }
        return false;
    }
    createType(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    node, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    reference) {
        return new IsoFormattedDateStringType(); // Treat constructors as strings in this example
    }
}
// We configure the parser an add our custom parser to it.
(async () => {
    const files = await recursive_readdir_1.default("api");
    const schemaDefinitions = files.filter((file) => file.endsWith(".d.ts"));
    // Load the changes cache file if it exists:
    let changes = {};
    try {
        changes = JSON.parse(await promises_1.default.readFile("./schema-cache.json", "utf8"));
    }
    catch (e) {
        console.log("Cache doesn't exist?", e);
    }
    const updatedSchemas = [];
    for (const typedefFile of schemaDefinitions) {
        const file = await promises_1.default.readFile(typedefFile);
        const hash = crypto_1.default.createHash("sha1");
        hash.update(file);
        const digest = hash.digest("hex");
        if (!changes[typedefFile] ||
            (changes[typedefFile] && changes[typedefFile] !== digest)) {
            changes[typedefFile] = digest;
            const exportedNames = [];
            {
                // Use the typescript compiler to extract all the exported types:
                const program = typescript_1.default.createProgram([typedefFile], {});
                const source = program.getSourceFile(typedefFile);
                const fileSymbol = program
                    .getTypeChecker()
                    .getSymbolAtLocation(source);
                if (source && fileSymbol) {
                    const exported = program
                        .getTypeChecker()
                        .getExportsOfModule(fileSymbol);
                    for (const e of exported) {
                        if (e.declarations) {
                            for (const declaration of e.declarations) {
                                if (declaration.modifiers) {
                                    for (const modifier of declaration.modifiers) {
                                        if (modifier.kind === typescript_1.default.SyntaxKind.ExportKeyword) {
                                            exportedNames.push(declaration.name.escapedText);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            for (const exportedName of exportedNames) {
                const config = {
                    path: typedefFile,
                    tsconfig: "./tsconfig.json",
                    type: exportedName, // Or <type-name> if you want to generate schema for that one type only
                };
                // Get the exported types from each of the schema files that has changed.
                const formatter = ts_json_schema_generator_1.createFormatter(config, (fmt) => {
                    // If your formatter DOES NOT support children, e.g. getChildren() { return [] }:
                    fmt.addTypeFormatter(new IntegerFormatter());
                    fmt.addTypeFormatter(new FloatZeroOneFormatter());
                    fmt.addTypeFormatter(new IsoFormattedDateStringFormatter());
                });
                const program = ts_json_schema_generator_1.createProgram(config);
                const parser = ts_json_schema_generator_1.createParser(program, config, (prs) => {
                    prs.addNodeParser(new TypeAliasParser());
                    prs.addNodeParser(new FloatZeroOneParser());
                    prs.addNodeParser(new IsoFormattedDateStringParser());
                });
                const generator = new ts_json_schema_generator_1.SchemaGenerator(program, parser, formatter, config);
                const schema = generator.createSchema(config.type);
                const schemaString = JSON.stringify(schema, null, 2);
                const subdirNames = typedefFile.replace(".d.ts", "").split("/");
                const p = [];
                try {
                    await promises_1.default.access(`./jsonSchemas`);
                }
                catch (e) {
                    await promises_1.default.mkdir(`./jsonSchemas`);
                }
                if (subdirNames.length) {
                    while (p.length < subdirNames.length) {
                        p.push(subdirNames[p.length]);
                        try {
                            await promises_1.default.access(`./jsonSchemas/${p.join("/")}`);
                        }
                        catch (e) {
                            await promises_1.default.mkdir(`./jsonSchemas/${p.join("/")}`);
                        }
                    }
                }
                await promises_1.default.writeFile(`./jsonSchemas/${subdirNames.join("/")}/${exportedName}.schema.json`, schemaString);
                updatedSchemas.push(typedefFile);
            }
        }
        else {
            changes[typedefFile] = digest;
            console.log(`Schema def ${typedefFile} unchanged, skipping`);
        }
    }
    if (updatedSchemas.length) {
        console.log(`Built ${updatedSchemas.length} json schemas`);
        await promises_1.default.writeFile("./schema-cache.json", JSON.stringify(changes, null, 2));
    }
    process.exit();
})();
