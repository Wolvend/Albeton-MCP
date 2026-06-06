declare module "sql.js" {
  export type SqlValue = string | number | Uint8Array | null;

  export interface Statement {
    bind(values?: SqlValue[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, SqlValue>;
    run(values?: SqlValue[]): void;
    free(): void;
  }

  export interface Database {
    run(sql: string, params?: SqlValue[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | Buffer) => Database;
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
}
