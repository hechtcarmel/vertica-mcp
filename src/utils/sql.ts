/** A conservative statement guard, not a SQL parser or a substitute for DB grants. */
interface Token {
  word: string;
  start: number;
  end: number;
}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const start = i;
    const ch = sql[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (sql.startsWith("--", i)) {
      while (i < sql.length && sql[i] !== "\n" && sql[i] !== "\r") i++;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) throw new Error("Unterminated SQL comment");
      continue;
    }
    const dollar = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end === -1) throw new Error("Unterminated dollar-quoted SQL string");
      i = end + dollar.length;
      tokens.push({ word: "<literal>", start, end: i });
      continue;
    }
    if (ch === "'" || ch === '"') {
      i++;
      let closed = false;
      while (i < sql.length) {
        // Reject ambiguous escapes rather than depend on server string modes.
        if (sql[i] === "\\" && ch === "'")
          throw new Error(
            "Use bound parameters instead of backslash-escaped SQL strings",
          );
        if (sql[i++] === ch) {
          if (sql[i] === ch) {
            i++;
            continue;
          }
          closed = true;
          break;
        }
      }
      if (!closed) throw new Error("Unterminated SQL quoted value");
      tokens.push({ word: "<literal>", start, end: i });
      continue;
    }
    const word = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    i += word?.length ?? 1;
    tokens.push({ word: word?.toUpperCase() ?? ch, start, end: i });
  }
  return tokens;
}

export function singleStatement(sql: string): { sql: string; words: string[] } {
  const tokens = tokenize(sql);
  if (!tokens.length) throw new Error("SQL must contain a statement");
  const semicolon = tokens.findIndex((t) => t.word === ";");
  if (semicolon !== -1 && semicolon !== tokens.length - 1)
    throw new Error("Only one SQL statement is allowed per tool call");
  const last = tokens.at(-1)!;
  return {
    sql: sql.slice(0, last.word === ";" ? last.start : last.end).trim(),
    words: tokens.filter((t) => t.word !== ";").map((t) => t.word),
  };
}

const readPrefixes = new Set(["SELECT", "WITH", "SHOW", "DESCRIBE", "EXPLAIN"]);
const mutations = new Set([
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "UPSERT",
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
  "COPY",
  "LOAD",
  "EXPORT",
  "IMPORT",
  "GRANT",
  "REVOKE",
  "CALL",
  "DO",
  "EXECUTE",
  "PREPARE",
  "COMMIT",
  "ROLLBACK",
  "BEGIN",
  "START",
  "SET",
  "RESET",
  "INTO",
  "LOCK",
  "RELEASE",
  "SAVEPOINT",
  "PROFILE",
]);

export function readonlyStatement(sql: string, selectOnly = false): string {
  const statement = singleStatement(sql);
  const first = statement.words[0];
  if (
    !first ||
    !readPrefixes.has(first) ||
    (selectOnly && first !== "SELECT" && first !== "WITH") ||
    statement.words.some((word) => mutations.has(word))
  ) {
    throw new Error(
      "Only readonly queries are allowed (readonly mode is enabled). " +
        "Use SELECT, SHOW, DESCRIBE, EXPLAIN, or a readonly WITH statement. " +
        "To allow all queries, set VERTICA_READONLY_MODE=false.",
    );
  }
  return statement.sql;
}
