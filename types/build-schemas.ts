import {
    BaseType,
    createFormatter,
    createParser, createProgram,
    SchemaGenerator, SubNodeParser, Context, ReferenceType, SubTypeFormatter, FunctionType, Definition
} from "ts-json-schema-generator";
import fs from "fs";
import ts from "typescript";

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
    public supportsType(type: IntegerType): boolean {
        return type instanceof IntegerType;
    }

    public getDefinition(type: IntegerType): Definition {
        // Return a custom schema for the function property.
        return {
            type: "integer"
        };
    }

    public getChildren(type: IntegerType): BaseType[] {
        return [];
    }
}

class IsoFormattedDateStringFormatter implements SubTypeFormatter {
    public supportsType(type: IsoFormattedDateStringType): boolean {
        return type instanceof IsoFormattedDateStringType;
    }

    public getDefinition(type: IsoFormattedDateStringType): Definition {
        // Return a custom schema for the function property.
        return {
            type: "string",
            format: "IsoFormattedDateString"
        };
    }

    public getChildren(type: IsoFormattedDateStringType): BaseType[] {
        return [];
    }
}

class FloatZeroOneFormatter implements SubTypeFormatter {
    public supportsType(type: FloatZeroOneType): boolean {
        return type instanceof FloatZeroOneType;
    }

    public getDefinition(type: FloatZeroOneType): Definition {
        // Return a custom schema for the function property.
        return {
            type: "number",
            format: "FloatZeroOne"
        };
    }

    public getChildren(type: FloatZeroOneType): BaseType[] {
        return [];
    }
}

class TypeAliasParser implements SubNodeParser {
    supportsNode(node: ts.Node): boolean {
        if (node.kind === ts.SyntaxKind.TypeAliasDeclaration && (node as any).name.escapedText === "integer") {
            return true;
        }
        return false;
    }
    createType(node: ts.Node, context: Context, reference?: ReferenceType): BaseType | undefined {
        return new IntegerType(); // Treat constructors as strings in this example
    }
}

class FloatZeroOneParser implements SubNodeParser {
    supportsNode(node: ts.Node): boolean {
        if (node.kind === ts.SyntaxKind.TypeAliasDeclaration && (node as any).name.escapedText === "FloatZeroToOne") {
            return true;
        }
        return false;
    }
    createType(node: ts.Node, context: Context, reference?: ReferenceType): BaseType | undefined {
        return new FloatZeroOneType(); // Treat constructors as strings in this example
    }
}

class IsoFormattedDateStringParser implements SubNodeParser {
    supportsNode(node: ts.Node): boolean {
        if (node.kind === ts.SyntaxKind.TypeAliasDeclaration && (node as any).name.escapedText === "IsoFormattedDateString") {
            return true;
        }
        return false;
    }
    createType(node: ts.Node, context: Context, reference?: ReferenceType): BaseType | undefined {
        return new IsoFormattedDateStringType(); // Treat constructors as strings in this example
    }
}


const config = {
    path: "./processing.d.ts",
    tsconfig: "./tsconfig.json",
    type: "ClassifierRawResult", // Or <type-name> if you want to generate schema for that one type only
};

// const config = {
//     path: "./test.d.ts",
//     tsconfig: "./tsconfig.json",
//     type: "Test", // Or <type-name> if you want to generate schema for that one type only
// };

// We configure the parser an add our custom parser to it.


const formatter = createFormatter(config, (fmt, circularReferenceTypeFormatter) => {
    // If your formatter DOES NOT support children, e.g. getChildren() { return [] }:
    fmt.addTypeFormatter(new IntegerFormatter());
    fmt.addTypeFormatter(new FloatZeroOneFormatter());
    fmt.addTypeFormatter(new IsoFormattedDateStringFormatter());
});

const output_path = "./jsonSchemas/ClassifierRawResult.schema.json";

const program = createProgram(config);
const parser = createParser(program, config, (prs) => {
    prs.addNodeParser(new TypeAliasParser());
    prs.addNodeParser(new FloatZeroOneParser());
    prs.addNodeParser(new IsoFormattedDateStringParser());
});

//const formatter = createFormatter(config);
const generator = new SchemaGenerator(program, parser, formatter, config);
const schema = generator.createSchema(config.type);
const schemaString = JSON.stringify(schema, null, 2);
fs.writeFile(output_path, schemaString, (err) => {
    if (err) throw err;
});

console.log("Built json schemas");
