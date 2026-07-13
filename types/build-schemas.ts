import {
  BaseType,
  SubNodeParser,
  Context,
  ReferenceType,
  SubTypeFormatter,
  FunctionType,
  Definition,
  createFormatter,
  createProgram,
  createParser,
  SchemaGenerator,
  ts,
  CompletedConfig,
  DEFAULT_CONFIG,
} from "ts-json-schema-generator";
import fs from "fs/promises";
import crypto from "crypto";
import readdir from "recursive-readdir";

class IntegerType extends FunctionType {
  public getId(): string {
    return "integer";
  }
}

class FloatZeroOneType extends FunctionType {
  public getId(): string {
    return "FloatZeroToOne";
  }
}

class IsoFormattedDateStringType extends FunctionType {
  public getId(): string {
    return "IsoFormattedDateString";
  }
}

class IntegerFormatter implements SubTypeFormatter {
  public supportsType(type: BaseType): boolean {
    return type instanceof IntegerType;
  }

  public getDefinition(_type: IntegerType): Definition {
    // Return a custom schema for the function property.
    return {
      type: "integer",
    };
  }

  public getChildren(_type: IntegerType): BaseType[] {
    return [];
  }
}

class IsoFormattedDateStringFormatter implements SubTypeFormatter {
  public supportsType(type: BaseType): boolean {
    return type instanceof IsoFormattedDateStringType;
  }

  public getDefinition(_type: IsoFormattedDateStringType): Definition {
    // Return a custom schema for the function property.
    return {
      type: "string",
      format: "date-time",
      // Is it worth validating minimum and maximum dates here?
    };
  }

  public getChildren(_type: IsoFormattedDateStringType): BaseType[] {
    return [];
  }
}

class FloatZeroOneFormatter implements SubTypeFormatter {
  public supportsType(type: BaseType): boolean {
    return type instanceof FloatZeroOneType;
  }

  public getDefinition(_type: FloatZeroOneType): Definition {
    // Return a custom schema for the function property.
    return {
      type: "number",
      minimum: 0.0,
      maximum: 1.0,
    };
  }

  public getChildren(_type: FloatZeroOneType): BaseType[] {
    return [];
  }
}

class TypeAliasParser implements SubNodeParser {
  supportsNode(node: ts.Node): boolean {
    return (
      node.kind === ts.SyntaxKind.TypeAliasDeclaration &&
      (node as unknown as { name: { escapedText: string } }).name
        .escapedText === "integer"
    );
  }
  createType(
    _node: ts.Node,
    _context: Context,
    _reference?: ReferenceType,
  ): BaseType {
    return new IntegerType(); // Treat constructors as strings in this example
  }
}

class FloatZeroOneParser implements SubNodeParser {
  supportsNode(node: ts.Node): boolean {
    return (
      node.kind === ts.SyntaxKind.TypeAliasDeclaration &&
      (node as unknown as { name: { escapedText: string } }).name
        .escapedText === "FloatZeroToOne"
    );
  }
  createType(
    _node: ts.Node,
    _context: Context,
    _reference?: ReferenceType,
  ): BaseType {
    return new FloatZeroOneType(); // Treat constructors as strings in this example
  }
}

class IsoFormattedDateStringParser implements SubNodeParser {
  supportsNode(node: ts.Node): boolean {
    return (
      node.kind === ts.SyntaxKind.TypeAliasDeclaration &&
      (node as unknown as { name: { escapedText: string } }).name
        .escapedText === "IsoFormattedDateString"
    );
  }
  createType(
    _node: ts.Node,
    _context: Context,
    _reference?: ReferenceType,
  ): BaseType {
    return new IsoFormattedDateStringType(); // Treat constructors as strings in this example
  }
}

// We configure the parser an add our custom parser to it.
(async () => {
  console.log("Generating schemas");
  const files = await readdir("api");

  const schemaDefinitions = files.filter((file) => file.endsWith(".d.ts"));
  // Load the changes cache file if it exists:
  let changes: Record<string, string> = {};
  try {
    changes = JSON.parse(await fs.readFile("../api/schema-cache.json", "utf8"));
  } catch (_e) {
    console.log("Schema cache doesn't exist., recreating all schemas.");
  }
  const updatedSchemas = [];
  const thisFile = await fs.readFile("./build-schemas.ts", "utf8");
  schemaDefinitions.sort((a, b) => a.localeCompare(b));
  for (const typedefFile of schemaDefinitions) {
    const file = await fs.readFile(typedefFile);
    const hash = crypto.createHash("sha1");
    hash.update(thisFile);
    hash.update(file);
    const digest = hash.digest("hex");
    if (
      !changes[typedefFile] ||
      (changes[typedefFile] && changes[typedefFile] !== digest)
    ) {
      console.log(`Schema def ${typedefFile} changed, re-compiling`);
      changes[typedefFile] = digest;
      const exportedNames: string[] = [];
      {
        // Use the typescript compiler to extract all the exported types:
        const program = ts.createProgram([typedefFile], {});
        const source = program.getSourceFile(typedefFile);
        const fileSymbol = program
          .getTypeChecker()
          .getSymbolAtLocation(source as ts.Node);
        if (source && fileSymbol) {
          const exported = program
            .getTypeChecker()
            .getExportsOfModule(fileSymbol);
          for (const e of exported) {
            exportedNames.push(e.name);
          }
        }
      }
      for (const exportedName of exportedNames) {
        const config: CompletedConfig = {
          ...DEFAULT_CONFIG,
          path: typedefFile,
          tsconfig: "./tsconfig.json",
          type: exportedName, // Or <type-name> if you want to generate schema for that one type only
          topRef: true,
          additionalProperties: false,
        };

        // Get the exported types from each of the schema files that has changed.
        const formatter = createFormatter(config, (fmt) => {
          // If your formatter DOES NOT support children, e.g. getChildren() { return [] }:
          fmt.addTypeFormatter(new IntegerFormatter());
          fmt.addTypeFormatter(new FloatZeroOneFormatter());
          fmt.addTypeFormatter(new IsoFormattedDateStringFormatter());
        });

        const program = createProgram(config);
        const parser = createParser(program, config, (prs) => {
          prs.addNodeParser(new TypeAliasParser());
          prs.addNodeParser(new FloatZeroOneParser());
          prs.addNodeParser(new IsoFormattedDateStringParser());
        });

        const generator = new SchemaGenerator(
          program,
          parser,
          formatter,
          config,
        );
        const schema = generator.createSchema(config.type);
        const schemaString = JSON.stringify(schema, null, 2);

        const subdirNames = typedefFile.replace(".d.ts", "").split("/");
        const p = [];
        try {
          await fs.access(`../api/json-schemas`);
        } catch (_e) {
          await fs.mkdir(`../api/json-schemas`);
        }
        if (subdirNames.length) {
          while (p.length < subdirNames.length) {
            p.push(subdirNames[p.length]);
            try {
              await fs.access(`../api/json-schemas/${p.join("/")}`);
            } catch (_e) {
              await fs.mkdir(`../api/json-schemas/${p.join("/")}`);
            }
          }
        }
        await fs.writeFile(
          `../api/json-schemas/${subdirNames.join(
            "/",
          )}/${exportedName}.schema.json`,
          schemaString,
        );
        updatedSchemas.push(typedefFile);
      }
    } else {
      changes[typedefFile] = digest;
    }
  }
  if (updatedSchemas.length) {
    console.log(`Built ${updatedSchemas.length} json schemas`);
    await fs.writeFile(
      "../api/schema-cache.json",
      JSON.stringify(changes, null, 2),
    );
  }
  process.exit();
})();
