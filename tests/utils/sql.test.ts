import { describe, it, expect } from "vitest";
import { readonlyStatement, singleStatement } from "../../src/utils/sql.js";
describe("SQL safety", () => {
  it.each([
    "SELECT 1",
    "select 1; -- tail",
    "/* first /* nested */ comment */ SELECT 1",
    "-- comment\nWITH c AS (SELECT 1) SELECT * FROM c",
    "SHOW TABLES",
    "DESCRIBE foo",
    "EXPLAIN SELECT * FROM foo",
    "SELECT '; DELETE', \"UPDATE\" FROM foo",
    "SELECT 'it''s fine'",
    "SELECT $$; DROP TABLE x;$$",
    "SELECT $tag$DELETE$tag$",
  ])("accepts readonly SQL: %s", (sql) =>
    expect(() => readonlyStatement(sql)).not.toThrow(),
  );
  it.each([
    "SELECT 1; DELETE FROM x",
    "WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x",
    "WITH x AS (SELECT 1) DELETE FROM t",
    "EXPLAIN INSERT INTO t VALUES (1)",
    "SELECT 1 INTO x",
    "SELECT * FROM x FOR UPDATE",
    "SELECTED 1",
    "SHOWCASE x",
    "COPY t FROM LOCAL '/etc/passwd'",
    "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE",
    "SELECT 1; ;",
    "SELECT 'unclosed",
    "SELECT $$unclosed",
    "/* unclosed",
    "-- empty",
    "SELECT E'bad\\'; DELETE FROM x --'",
    "SELECT 1; COMMIT",
    "",
    "SELECT 1; /* nested */ DROP TABLE x",
  ])("rejects unsafe or malformed SQL: %s", (sql) =>
    expect(() => readonlyStatement(sql)).toThrow(),
  );
  it("allows single writes only when callers explicitly choose write mode", () => {
    expect(singleStatement("INSERT INTO x VALUES (?);").sql).toBe(
      "INSERT INTO x VALUES (?)",
    );
    expect(() =>
      singleStatement("INSERT INTO x VALUES (1); DROP TABLE x"),
    ).toThrow("one SQL statement");
  });
  it("requires a SELECT/WITH statement for batching", () =>
    expect(() => readonlyStatement("SHOW TABLES", true)).toThrow());
});
