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
});