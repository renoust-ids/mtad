import { DbDataSource, DbDriver, DataSourceId } from "../src/DataSource";
import { DuckDBDialect } from "../src/dialects/DuckDBDialect";
import { Schema } from "../src/Schema";

const sourceId: DataSourceId = {
  providerName: "duckdb",
  resourceId: ":memory:",
};

const noop = async (): Promise<any> => null;

const makeDriver = (runSqlQuery: jest.Mock): DbDriver => ({
  sourceId,
  dialect: DuckDBDialect,
  runSqlQuery,
  getTableSchema: jest.fn().mockResolvedValue(
    new Schema(DuckDBDialect, [], {})
  ),
  getSqlQuerySchema: noop,
  getSqlQueryColumnStatsMap: noop,
  getRootNode: noop,
  getChildren: noop,
  getTableName: noop,
  getDisplayName: noop,
});

describe("DbDataSource row/column mutations", () => {
  test("insertRow generates INSERT DEFAULT VALUES", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));
    await ds.insertRow("mytable");
    expect(runSqlQuery).toHaveBeenCalledWith(
      'INSERT INTO "mytable" DEFAULT VALUES'
    );
  });

  test("insertColumn generates ADD COLUMN and invalidates schema cache", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));
    await ds.insertColumn("mytable", "new_col");
    expect(runSqlQuery).toHaveBeenCalledWith(
      'ALTER TABLE "mytable" ADD COLUMN "new_col" VARCHAR'
    );
    // schema for the table should be re-fetched afterwards (cache invalidated)
    const leafKey = JSON.stringify({ operator: "table", tableName: "mytable" });
    expect((ds as any).tableMap[leafKey]).toBeUndefined();
  });

  test("does not duplicate _rid when the table schema already provides one", async () => {
    const existing = new Schema(DuckDBDialect, ["id", "_rid"], {
      id: { columnType: "integer", displayName: "id" },
      _rid: { columnType: "integer", displayName: "_rid" },
    });
    const driver = makeDriver(jest.fn());
    driver.getTableSchema = jest.fn().mockResolvedValue(existing);
    const ds = new DbDataSource(driver);

    // resolve the leaf schema for a table that already carries a _rid column
    const schema = await (ds as any).getLeafDepSchema(
      JSON.stringify({ operator: "table", tableName: "mytable" }),
      { operator: "table", tableName: "mytable" }
    );

    const ridCount = schema.columns.filter((c: string) => c === "_rid").length;
    expect(ridCount).toBe(1);
  });
});