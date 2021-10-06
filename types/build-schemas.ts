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
} from "ts-json-schema-generator";
import fs from "fs/promises";
import ts from "typescript";
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
    reference?: ReferenceType
  ): BaseType | undefined {
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
    reference?: ReferenceType
  ): BaseType | undefined {
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
    reference?: ReferenceType
  ): BaseType | undefined {
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
    changes = JSON.parse(await fs.readFile("./schema-cache.json", "utf8"));
  } catch (e) {
    console.log("Cache doesn't exist?", e);
  }
  const updatedSchemas = [];
  for (const typedefFile of schemaDefinitions) {
    const file = await fs.readFile(typedefFile);
    const hash = crypto.createHash("sha1");
    hash.update(file);
    const digest = hash.digest("hex");
    if (
      !changes[typedefFile] ||
      (changes[typedefFile] && changes[typedefFile] !== digest)
    ) {
      changes[typedefFile] = digest;
      const exportedNames = [];
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
                if (declaration.modifiers) {
                  for (const modifier of declaration.modifiers) {
                    if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
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
        };

        // Get the exported types from each of the schema files that has changed.
        const formatter = createFormatter(
          config,
          (fmt, circularReferenceTypeFormatter) => {
            // If your formatter DOES NOT support children, e.g. getChildren() { return [] }:
            fmt.addTypeFormatter(new IntegerFormatter());
            fmt.addTypeFormatter(new FloatZeroOneFormatter());
            fmt.addTypeFormatter(new IsoFormattedDateStringFormatter());
          }
        );

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
          config
        );
        const schema = generator.createSchema(config.type);
        const schemaString = JSON.stringify(schema, null, 2);

        const subdirNames = typedefFile.replace(".d.ts", "").split("/");
        const p = [];
        try {
          await fs.access(`./jsonSchemas`);
        } catch (e) {
          await fs.mkdir(`./jsonSchemas`);
        }
        if (subdirNames.length) {
          while (p.length < subdirNames.length) {
            p.push(subdirNames[p.length]);
            try {
              await fs.access(`./jsonSchemas/${p.join("/")}`);
            } catch (e) {
              await fs.mkdir(`./jsonSchemas/${p.join("/")}`);
            }
          }
        }
        await fs.writeFile(
          `./jsonSchemas/${subdirNames.join("/")}/${exportedName}.schema.json`,
          schemaString
        );
        updatedSchemas.push(typedefFile);
      }
    } else {
      changes[typedefFile] = digest;
      console.log(`Schema def ${typedefFile} unchanged, skipping`);
    }
  }
  if (updatedSchemas.length) {
    console.log(`Built ${updatedSchemas.length} json schemas`);
    await fs.writeFile("./schema-cache.json", JSON.stringify(changes, null, 2));
  }
  process.exit();
})();
