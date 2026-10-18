/**
 * Compares the frontend's type for a character sheet with the type the
 * backend's Zod schema accepts, field by field, using the TypeScript compiler.
 *
 * The frontend cannot import the schemas (its image is built from frontend/
 * alone), so each sheet is declared twice: the schema, which decides what is
 * stored, and the frontend type, which every sheet component trusts. This is
 * the check that keeps the second in step with the first.
 *
 * The side compared is the schema's input (`z.input`), not its output. The
 * server sends a sheet as it is stored, without running it through the
 * schema, so a sheet saved before a field existed arrives without it even
 * where the schema now fills in a default, and a value the schema converts on
 * save (a number stored as a string, say) can still arrive in its older form.
 * The frontend type has to allow both.
 */

import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../../..');

export interface SheetPair {
  /** A short name for messages, such as "D&D 5e". */
  label: string;
  /** The schema module, relative to the repository root, without extension. */
  schemaModule: string;
  schemaExport: string;
  /** The frontend module, relative to the repository root, without extension. */
  typeModule: string;
  typeExport: string;
}

/**
 * Builds one program over every pair and returns, for each label, the fields
 * where the frontend type and the schema's input disagree.
 */
export function sheetTypeMismatches(pairs: SheetPair[]): Record<string, string[]> {
  const virtualPath = path.join(ROOT, 'backend/src/__tests__/__sheetTypeParity__.ts');
  const abs = (module: string) => path.join(ROOT, module).replace(/\\/g, '/');
  const source = [
    "import type { input } from 'zod';",
    ...pairs.flatMap((pair, i) => [
      `import type { ${pair.typeExport} as Client${i} } from '${abs(pair.typeModule)}';`,
      `import { ${pair.schemaExport} as schema${i} } from '${abs(pair.schemaModule)}';`,
      `export type ServerSide${i} = input<typeof schema${i}>;`,
      `export type ClientSide${i} = Client${i};`,
    ]),
  ].join('\n');

  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: { '@/*': [`${abs('frontend/src')}/*`] },
    types: [],
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
  };
  const host = ts.createCompilerHost(options, true);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (file) => file === virtualPath || fileExists(file);
  host.readFile = (file) => (file === virtualPath ? source : readFile(file));
  host.getSourceFile = (file, version, onError, create) =>
    file === virtualPath ? ts.createSourceFile(file, source, version, true) : getSourceFile(file, version, onError, create);

  const program = ts.createProgram([virtualPath], options, host);
  const checker = program.getTypeChecker();
  const unresolved = ts
    .getPreEmitDiagnostics(program, program.getSourceFile(virtualPath))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  if (unresolved.length) throw new Error(`the sheet type check does not compile:\n${unresolved.join('\n')}`);

  const file = program.getSourceFile(virtualPath)!;
  const fileSymbol = checker.getSymbolAtLocation(file)!;
  const exported = new Map(checker.getExportsOfModule(fileSymbol).map((s) => [s.name, s]));
  const declared = (name: string) => checker.getDeclaredTypeOfSymbol(exported.get(name)!);

  const result: Record<string, string[]> = {};
  pairs.forEach((pair, i) => {
    const out: string[] = [];
    // A schema wrapped in z.preprocess, or annotated as z.ZodType<T>, takes
    // unknown, and comparing unknown checks nothing.
    const server = checker.getNonNullableType(declared(`ServerSide${i}`));
    if (!isPlainObject(checker, server) || checker.getPropertiesOfType(server).length === 0) {
      out.push(`(the sheet): the schema takes ${checker.typeToString(server)}, not an object with fields, so nothing can be compared`);
    }
    compare(checker, declared(`ClientSide${i}`), declared(`ServerSide${i}`), '', out, new Set());
    result[pair.label] = out;
  });
  return result;
}

const parts = (t: ts.Type) => (t.isUnion() ? t.types : [t]);
const has = (t: ts.Type, flag: ts.TypeFlags) => parts(t).some((p) => (p.flags & flag) !== 0);

function isPlainObject(checker: ts.TypeChecker, t: ts.Type): boolean {
  if (t.isUnion() || checker.isArrayType(t) || checker.isTupleType(t)) return false;
  // `CoC7eSkill & { language: string }` is an object too.
  if (t.isIntersection()) return t.types.every((p) => isPlainObject(checker, p));
  if (!(t.flags & ts.TypeFlags.Object)) return false;
  return checker.getPropertiesOfType(t).length > 0 || checker.getIndexInfosOfType(t).length > 0;
}

/** " (frontend/src/types/…:line)", where a frontend property is declared, for the message. */
function declaredAt(symbol: ts.Symbol): string {
  const declaration = symbol.declarations?.[0];
  if (!declaration) return '';
  const file = declaration.getSourceFile();
  const line = file.getLineAndCharacterOfPosition(declaration.getStart()).line + 1;
  return ` (${path.relative(ROOT, file.fileName).replace(/\\/g, '/')}:${line})`;
}

function elementOf(checker: ts.TypeChecker, t: ts.Type): ts.Type {
  return checker.getTypeArguments(t as ts.TypeReference)[0];
}

/** Follows both types together and records each place they disagree. */
function compare(checker: ts.TypeChecker, client: ts.Type, server: ts.Type, at: string, out: string[], seen: Set<string>): void {
  const here = at || '(the sheet)';
  const key = `${checker.typeToString(client)}|${checker.typeToString(server)}|${at}`;
  if (seen.has(key)) return;
  seen.add(key);

  // A preprocessed field: anything goes in. Tested before null is removed,
  // which turns unknown into {}.
  if (server.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) return;
  const serverNonNull = checker.getNonNullableType(server);
  const clientNonNull = checker.getNonNullableType(client);
  if (clientNonNull.flags & ts.TypeFlags.Any) {
    out.push(`${here}: the frontend type is any`);
    return;
  }
  if (has(server, ts.TypeFlags.Null) && !has(client, ts.TypeFlags.Null)) out.push(`${here}: can be null, the frontend type does not allow null`);
  if (has(client, ts.TypeFlags.Null) && !has(server, ts.TypeFlags.Null)) out.push(`${here}: the frontend type allows null, the schema does not`);

  if (checker.isArrayType(serverNonNull) && checker.isArrayType(clientNonNull)) {
    compare(checker, elementOf(checker, clientNonNull), elementOf(checker, serverNonNull), `${at}[]`, out, seen);
    return;
  }
  if (isPlainObject(checker, serverNonNull) && isPlainObject(checker, clientNonNull)) {
    const serverProps = new Map(checker.getPropertiesOfType(serverNonNull).map((p) => [p.name, p]));
    const clientProps = new Map(checker.getPropertiesOfType(clientNonNull).map((p) => [p.name, p]));
    for (const name of serverProps.keys()) {
      if (!clientProps.has(name)) out.push(`${at ? `${at}.` : ''}${name}: in the schema, missing from the frontend type`);
    }
    for (const [name, clientProp] of clientProps) {
      const serverProp = serverProps.get(name);
      const field = `${at ? `${at}.` : ''}${name}${declaredAt(clientProp)}`;
      if (!serverProp) {
        out.push(`${field}: in the frontend type, not in the schema`);
        continue;
      }
      const serverOptional = (serverProp.flags & ts.SymbolFlags.Optional) !== 0;
      const clientOptional = (clientProp.flags & ts.SymbolFlags.Optional) !== 0;
      if (serverOptional && !clientOptional) out.push(`${field}: can be absent, the frontend type requires it`);
      if (!serverOptional && clientOptional) out.push(`${field}: always present, the frontend type makes it optional`);
      compare(checker, checker.getTypeOfSymbol(clientProp), checker.getTypeOfSymbol(serverProp), at ? `${at}.${name}` : name, out, seen);
    }
    const serverIndex = checker.getIndexInfosOfType(serverNonNull);
    const clientIndex = checker.getIndexInfosOfType(clientNonNull);
    if (serverIndex.length && clientIndex.length) compare(checker, clientIndex[0].type, serverIndex[0].type, `${at}{}`, out, seen);
    else if (serverIndex.length !== clientIndex.length) out.push(`${here}: one side is a record, the other is not`);
    return;
  }
  const clientObjects = parts(clientNonNull).filter((p) => isPlainObject(checker, p));
  const serverObjects = parts(serverNonNull).filter((p) => isPlainObject(checker, p));
  if (clientObjects.length || serverObjects.length) {
    compareUnion(checker, clientNonNull, serverNonNull, clientObjects, serverObjects, at, out, seen);
    return;
  }
  // A leaf or a tuple: the two must accept the same values.
  if (!checker.isTypeAssignableTo(clientNonNull, serverNonNull) || !checker.isTypeAssignableTo(serverNonNull, clientNonNull)) {
    out.push(`${here}: the frontend type is ${checker.typeToString(clientNonNull)}, the schema takes ${checker.typeToString(serverNonNull)}`);
  }
}

/**
 * A union with object members, such as `string | { name, rank }` or the
 * Flexible sections. Whether each side accepts the other is too weak a test
 * here: an optional field on one side only passes it. So the other members
 * must accept the same values, and the objects are compared field by field,
 * paired by the literal field they all have (`type`) when there are several.
 */
function compareUnion(
  checker: ts.TypeChecker,
  client: ts.Type,
  server: ts.Type,
  clientObjects: ts.Type[],
  serverObjects: ts.Type[],
  at: string,
  out: string[],
  seen: Set<string>
): void {
  const here = at || '(the sheet)';
  const others = (t: ts.Type) => parts(t).filter((p) => !isPlainObject(checker, p));
  const acceptedBy = (p: ts.Type, side: ts.Type[]) => side.some((q) => checker.isTypeAssignableTo(p, q));
  const clientOthers = others(client);
  const serverOthers = others(server);
  for (const p of serverOthers) {
    if (!acceptedBy(p, clientOthers)) out.push(`${here}: the schema also takes ${checker.typeToString(p)}, the frontend type does not`);
  }
  for (const p of clientOthers) {
    if (!acceptedBy(p, serverOthers)) out.push(`${here}: the frontend type also allows ${checker.typeToString(p)}, the schema does not`);
  }

  if (clientObjects.length === 1 && serverObjects.length === 1) {
    compare(checker, clientObjects[0], serverObjects[0], at, out, seen);
    return;
  }
  const key = discriminant(checker, [...clientObjects, ...serverObjects]);
  if (!key) {
    out.push(`${here}: a union of ${clientObjects.length} and ${serverObjects.length} objects with no shared literal field to pair them by`);
    return;
  }
  const byValue = (members: ts.Type[]) => new Map(members.map((m) => [literalOf(checker, m, key)!, m]));
  const clientByValue = byValue(clientObjects);
  const serverByValue = byValue(serverObjects);
  for (const [value, serverMember] of serverByValue) {
    const member = `${at}(${key} '${value}')`;
    const clientMember = clientByValue.get(value);
    if (clientMember) compare(checker, clientMember, serverMember, member, out, seen);
    else out.push(`${member}: in the schema, missing from the frontend type`);
  }
  for (const value of clientByValue.keys()) {
    if (!serverByValue.has(value)) out.push(`${at}(${key} '${value}'): in the frontend type, not in the schema`);
  }
}

/** A field every member has, holding a different string literal in each. */
function discriminant(checker: ts.TypeChecker, members: ts.Type[]): string | undefined {
  const names = checker.getPropertiesOfType(members[0]).map((p) => p.name);
  return names.find((name) => members.every((m) => literalOf(checker, m, name) !== undefined));
}

function literalOf(checker: ts.TypeChecker, member: ts.Type, name: string): string | undefined {
  const property = checker.getPropertyOfType(member, name);
  if (!property) return undefined;
  const type = checker.getNonNullableType(checker.getTypeOfSymbol(property));
  return type.isStringLiteral() ? type.value : undefined;
}
