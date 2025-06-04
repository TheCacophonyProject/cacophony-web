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

  public getDefinition(type: IntegerType): Definition {
    // Return a custom schema for the function property.
    return {
      type: "integer",
    };
  }

  public getChildren(type: IntegerType): BaseType[] {
    return [];
  }
}

class IsoFormattedDateStringFormatter implements SubTypeFormatter {
  public supportsType(type: BaseType): boolean {
    return type instanceof IsoFormattedDateStringType;
  }

  public getDefinition(type: IsoFormattedDateStringType): Definition {
    // Return a custom schema for the function property.
    return {
      type: "string",
      format: "IsoFormattedDateString",
    };
  }

  public getChildren(type: IsoFormattedDateStringType): BaseType[] {
    return [];
  }
}

class FloatZeroOneFormatter implements SubTypeFormatter {
  public supportsType(type: BaseType): boolean {
    return type instanceof FloatZeroOneType;
  }

  public getDefinition(type: FloatZeroOneType): Definition {
    // Return a custom schema for the function property.
    return {
      type: "number",
      format: "FloatZeroOne",
    };
  }

  public getChildren(type: FloatZeroOneType): BaseType[] {
    return [];
  }
}

class TypeAliasParser implements SubNodeParser {
  supportsNode(node: ts.Node): boolean {
    if (
      node.kind === ts.SyntaxKind.TypeAliasDeclaration &&
      (node as any).name.escapedText === "integer"
    ) {
      return true;
    }
    return false;
  }
  createType(
    node: ts.Node,
    context: Context,
    reference?: ReferenceType,
  ): BaseType {
    return new IntegerType(); // Treat constructors as strings in this example
  }
}

class FloatZeroOneParser implements SubNodeParser {
  supportsNode(node: ts.Node): boolean {
    if (
      node.kind === ts.SyntaxKind.TypeAliasDeclaration &&
      (node as any).name.escapedText === "FloatZeroToOne"
    ) {
      return true;
    }
    return false;
  }
  createType(
    node: ts.Node,
    context: Context,
    reference?: ReferenceType,
  ): BaseType {
    return new FloatZeroOneType(); // Treat constructors as strings in this example
  }
}

class IsoFormattedDateStringParser implements SubNodeParser {
  supportsNode(node: ts.Node): boolean {
    if (
      node.kind === ts.SyntaxKind.TypeAliasDeclaration &&
      (node as any).name.escapedText === "IsoFormattedDateString"
    ) {
      return true;
    }
    return false;
  }
  createType(
    node: ts.Node,
    context: Context,
    reference?: ReferenceType,
  ): BaseType {
    return new IsoFormattedDateStringType(); // Treat constructors as strings in this example
  }
}

// We configure the parser an add our custom parser to it.
(async () => {
  const files = await readdir("api");

  const schemaDefinitions = files.filter((file) => file.endsWith(".d.ts"));
  // Load the changes cache file if it exists:
  let changes: Record<string, string> = {};
  try {
    changes = JSON.parse(await fs.readFile("../api/schema-cache.json", "utf8"));
  } catch (e) {
    console.log("Schema cache doesn't exist., recreating all schemas.");
  }
  const updatedSchemas = [];
  schemaDefinitions.sort((a, b) => a.localeCompare(b));
  for (const typedefFile of schemaDefinitions) {
    const file = await fs.readFile(typedefFile, "utf8");
    const hash = crypto.createHash("sha1");
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
            if (e.declarations) {
              for (const declaration of e.declarations) {
                if ((declaration as any).modifiers) {
                  for (const modifier of (declaration as any).modifiers) {
                    if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
                      //console.log("Declaration", declaration);
                      exportedNames.push((declaration as any).name.escapedText);
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
          topRef: true,
          additionalProperties: false,
        } as any;

        // Get the exported types from each of the schema files that has changed.
        const formatter = createFormatter(config as any, (fmt) => {
          // If your formatter DOES NOT support children, e.g. getChildren() { return [] }:
          fmt.addTypeFormatter(new IntegerFormatter());
          fmt.addTypeFormatter(new FloatZeroOneFormatter());
          fmt.addTypeFormatter(new IsoFormattedDateStringFormatter());
        });

        const program = createProgram(config as any);
        const parser = createParser(program, config as any, (prs) => {
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
        } catch (e) {
          await fs.mkdir(`../api/json-schemas`);
        }
        if (subdirNames.length) {
          while (p.length < subdirNames.length) {
            p.push(subdirNames[p.length]);
            try {
              await fs.access(`../api/json-schemas/${p.join("/")}`);
            } catch (e) {
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
