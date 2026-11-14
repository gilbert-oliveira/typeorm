import type { DataSource } from "../../data-source/DataSource"
import type { ObjectLiteral } from "../../common/ObjectLiteral"
import type { EntityManager } from "../../entity-manager/EntityManager"
import {
    TransactionAlreadyStartedError,
    TransactionNotStartedError,
    TypeORMError,
} from "../../error"
import type { ReadStream } from "../../platform/PlatformTools"
import type { QueryResult } from "../../query-runner/QueryResult"
import type { QueryRunner } from "../../query-runner/QueryRunner"
import type { Table } from "../../schema-builder/table/Table"
import type { TableCheck } from "../../schema-builder/table/TableCheck"
import type { TableColumn } from "../../schema-builder/table/TableColumn"
import type { TableExclusion } from "../../schema-builder/table/TableExclusion"
import type { TableForeignKey } from "../../schema-builder/table/TableForeignKey"
import type { TableIndex } from "../../schema-builder/table/TableIndex"
import type { TableUnique } from "../../schema-builder/table/TableUnique"
import type { View } from "../../schema-builder/view/View"
import { Broadcaster } from "../../subscriber/Broadcaster"
import type { SqlInMemory } from "../SqlInMemory"
import type { IsolationLevel } from "../types/IsolationLevel"
import type { ReplicationMode } from "../types/ReplicationMode"
import type {
    FirestoreAdapter,
    FirestoreTransactionHandle,
} from "./FirestoreAdapter"

const ROLLBACK_SENTINEL = new Error("Firestore transaction rolled back")

/**
 * Runs operations on a Firestore database.
 */
export class FirestoreQueryRunner implements QueryRunner {
    dataSource: DataSource

    /**
     * @deprecated since 1.0.0. Use {@link dataSource} instance instead.
     */
    get connection(): DataSource {
        return this.dataSource
    }

    broadcaster: Broadcaster

    manager: EntityManager

    isReleased = false

    isTransactionActive = false

    data = {}

    adapter: FirestoreAdapter

    transaction?: FirestoreTransactionHandle

    protected transactionPromise?: Promise<void>

    protected releaseTransaction?: {
        resolve(): void
        reject(error: unknown): void
    }

    constructor(dataSource: DataSource, adapter: FirestoreAdapter) {
        this.dataSource = dataSource
        this.adapter = adapter
        this.broadcaster = new Broadcaster(this)
    }

    async beforeMigration(): Promise<void> {}

    async afterMigration(): Promise<void> {}

    async connect(): Promise<any> {}

    async release(): Promise<void> {
        this.isReleased = true
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.release()
    }

    async clearDatabase(database?: string): Promise<void> {
        await this.adapter.deleteCollections(
            this.dataSource.entityMetadatas.map(
                (metadata) => metadata.tableName,
            ),
        )
    }

    async startTransaction(isolationLevel?: IsolationLevel): Promise<void> {
        if (this.isTransactionActive) throw new TransactionAlreadyStartedError()

        if (isolationLevel !== undefined) {
            throw new TypeORMError(
                `Isolation levels is not supported by Firestore.`,
            )
        }

        this.isTransactionActive = true
        try {
            await this.broadcaster.broadcast("BeforeTransactionStart")

            let release!: { resolve(): void; reject(error: unknown): void }
            const released = new Promise<void>((resolve, reject) => {
                release = { resolve, reject }
            })
            let started!: () => void
            const ready = new Promise<void>((resolve) => {
                started = resolve
            })

            const transactionPromise = this.adapter.runTransaction(
                async (tx) => {
                    this.transaction = tx
                    started()
                    await released
                },
            )
            transactionPromise.catch(() => undefined)
            this.releaseTransaction = release
            this.transactionPromise = transactionPromise

            await Promise.race([ready, transactionPromise])
        } catch (error) {
            this.clearTransaction()
            throw error
        }

        await this.broadcaster.broadcast("AfterTransactionStart")
    }

    async commitTransaction(): Promise<void> {
        const { releaseTransaction, transactionPromise } = this
        if (
            !this.isTransactionActive ||
            !releaseTransaction ||
            !transactionPromise
        )
            throw new TransactionNotStartedError()

        await this.broadcaster.broadcast("BeforeTransactionCommit")
        releaseTransaction.resolve()
        try {
            await transactionPromise
        } finally {
            this.clearTransaction()
        }
        await this.broadcaster.broadcast("AfterTransactionCommit")
    }

    async rollbackTransaction(): Promise<void> {
        const { releaseTransaction, transactionPromise } = this
        if (
            !this.isTransactionActive ||
            !releaseTransaction ||
            !transactionPromise
        )
            throw new TransactionNotStartedError()

        await this.broadcaster.broadcast("BeforeTransactionRollback")
        releaseTransaction.reject(ROLLBACK_SENTINEL)
        try {
            await transactionPromise
        } catch (error) {
            if (error !== ROLLBACK_SENTINEL) throw error
        } finally {
            this.clearTransaction()
        }
        await this.broadcaster.broadcast("AfterTransactionRollback")
    }

    protected clearTransaction(): void {
        this.transaction = undefined
        this.transactionPromise = undefined
        this.releaseTransaction = undefined
        this.isTransactionActive = false
    }

    query(
        query: string,
        parameters: any[] | ObjectLiteral | undefined,
        useStructuredResult: true,
    ): Promise<QueryResult>
    query(query: string, parameters?: any[] | ObjectLiteral): Promise<any>
    query(
        query: string,
        parameters?: any[] | ObjectLiteral,
        useStructuredResult?: boolean,
    ): Promise<any> {
        throw new TypeORMError(
            `Executing queries is not supported by Firestore.`,
        )
    }

    sql<T = any>(
        strings: TemplateStringsArray,
        ...values: unknown[]
    ): Promise<T> {
        throw new TypeORMError(`Executing SQL is not supported by Firestore.`)
    }

    stream(
        query: string,
        parameters?: any[],
        onEnd?: Function,
        onError?: Function,
    ): Promise<ReadStream> {
        throw new TypeORMError(`Streaming is not supported by Firestore.`)
    }

    getReplicationMode(): ReplicationMode {
        return "master"
    }

    getDatabases(): Promise<string[]> {
        throw new TypeORMError(
            `Database operations is not supported by Firestore.`,
        )
    }

    getSchemas(database?: string): Promise<string[]> {
        throw new TypeORMError(
            `Schema operations is not supported by Firestore.`,
        )
    }

    getTable(tablePath: string): Promise<Table | undefined> {
        throw new TypeORMError(
            `Table operations is not supported by Firestore.`,
        )
    }

    getTables(tablePaths?: string[]): Promise<Table[]> {
        throw new TypeORMError(
            `Table operations is not supported by Firestore.`,
        )
    }

    getView(viewPath: string): Promise<View | undefined> {
        throw new TypeORMError(`Views is not supported by Firestore.`)
    }

    getViews(viewPaths?: string[]): Promise<View[]> {
        throw new TypeORMError(`Views is not supported by Firestore.`)
    }

    hasDatabase(database: string): Promise<boolean> {
        throw new TypeORMError(
            `Database operations is not supported by Firestore.`,
        )
    }

    getCurrentDatabase(): Promise<string | undefined> {
        throw new TypeORMError(
            `Database operations is not supported by Firestore.`,
        )
    }

    hasSchema(schema: string): Promise<boolean> {
        throw new TypeORMError(
            `Schema operations is not supported by Firestore.`,
        )
    }

    getCurrentSchema(): Promise<string | undefined> {
        throw new TypeORMError(
            `Schema operations is not supported by Firestore.`,
        )
    }

    hasTable(table: Table | string): Promise<boolean> {
        throw new TypeORMError(
            `Table operations is not supported by Firestore.`,
        )
    }

    hasColumn(table: Table | string, columnName: string): Promise<boolean> {
        throw new TypeORMError(
            `Column operations is not supported by Firestore.`,
        )
    }

    createDatabase(database: string, ifNotExists?: boolean): Promise<void> {
        throw new TypeORMError(
            `Database operations is not supported by Firestore.`,
        )
    }

    dropDatabase(database: string, ifExists?: boolean): Promise<void> {
        throw new TypeORMError(
            `Database operations is not supported by Firestore.`,
        )
    }

    createSchema(schemaPath: string, ifNotExists?: boolean): Promise<void> {
        throw new TypeORMError(
            `Schema operations is not supported by Firestore.`,
        )
    }

    dropSchema(
        schemaPath: string,
        ifExists?: boolean,
        isCascade?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Schema operations is not supported by Firestore.`,
        )
    }

    createTable(
        table: Table,
        ifNotExists?: boolean,
        createForeignKeys?: boolean,
        createIndices?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Table operations is not supported by Firestore.`,
        )
    }

    dropTable(
        table: Table | string,
        ifExists?: boolean,
        dropForeignKeys?: boolean,
        dropIndices?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Table operations is not supported by Firestore.`,
        )
    }

    createView(
        view: View,
        syncWithMetadata?: boolean,
        oldView?: View,
    ): Promise<void> {
        throw new TypeORMError(`Views is not supported by Firestore.`)
    }

    dropView(view: View | string, ifExists?: boolean): Promise<void> {
        throw new TypeORMError(`Views is not supported by Firestore.`)
    }

    renameTable(
        oldTableOrName: Table | string,
        newTableName: string,
    ): Promise<void> {
        throw new TypeORMError(
            `Table operations is not supported by Firestore.`,
        )
    }

    changeTableComment(
        tableOrName: Table | string,
        comment?: string,
    ): Promise<void> {
        throw new TypeORMError(`Table comments is not supported by Firestore.`)
    }

    addColumn(table: Table | string, column: TableColumn): Promise<void> {
        throw new TypeORMError(
            `Column operations is not supported by Firestore.`,
        )
    }

    addColumns(table: Table | string, columns: TableColumn[]): Promise<void> {
        throw new TypeORMError(
            `Column operations is not supported by Firestore.`,
        )
    }

    renameColumn(
        table: Table | string,
        oldColumnOrName: TableColumn | string,
        newColumnOrName: TableColumn | string,
    ): Promise<void> {
        throw new TypeORMError(
            `Column operations is not supported by Firestore.`,
        )
    }

    changeColumn(
        table: Table | string,
        oldColumn: TableColumn | string,
        newColumn: TableColumn,
    ): Promise<void> {
        throw new TypeORMError(
            `Column operations is not supported by Firestore.`,
        )
    }

    changeColumns(
        table: Table | string,
        changedColumns: { oldColumn: TableColumn; newColumn: TableColumn }[],
    ): Promise<void> {
        throw new TypeORMError(
            `Column operations is not supported by Firestore.`,
        )
    }

    dropColumn(
        table: Table | string,
        column: TableColumn | string,
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Column operations is not supported by Firestore.`,
        )
    }

    dropColumns(
        table: Table | string,
        columns: TableColumn[] | string[],
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Column operations is not supported by Firestore.`,
        )
    }

    createPrimaryKey(
        table: Table | string,
        columnNames: string[],
        constraintName?: string,
    ): Promise<void> {
        throw new TypeORMError(
            `Primary key operations is not supported by Firestore.`,
        )
    }

    updatePrimaryKeys(
        table: Table | string,
        columns: TableColumn[],
    ): Promise<void> {
        throw new TypeORMError(
            `Primary key operations is not supported by Firestore.`,
        )
    }

    dropPrimaryKey(
        table: Table | string,
        constraintName?: string,
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Primary key operations is not supported by Firestore.`,
        )
    }

    createUniqueConstraint(
        table: Table | string,
        uniqueConstraint: TableUnique,
    ): Promise<void> {
        throw new TypeORMError(
            `Unique constraints is not supported by Firestore.`,
        )
    }

    createUniqueConstraints(
        table: Table | string,
        uniqueConstraints: TableUnique[],
    ): Promise<void> {
        throw new TypeORMError(
            `Unique constraints is not supported by Firestore.`,
        )
    }

    dropUniqueConstraint(
        table: Table | string,
        uniqueOrName: TableUnique | string,
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Unique constraints is not supported by Firestore.`,
        )
    }

    dropUniqueConstraints(
        table: Table | string,
        uniqueConstraints: TableUnique[],
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Unique constraints is not supported by Firestore.`,
        )
    }

    createCheckConstraint(
        table: Table | string,
        checkConstraint: TableCheck,
    ): Promise<void> {
        throw new TypeORMError(
            `Check constraints is not supported by Firestore.`,
        )
    }

    createCheckConstraints(
        table: Table | string,
        checkConstraints: TableCheck[],
    ): Promise<void> {
        throw new TypeORMError(
            `Check constraints is not supported by Firestore.`,
        )
    }

    dropCheckConstraint(
        table: Table | string,
        checkOrName: TableCheck | string,
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Check constraints is not supported by Firestore.`,
        )
    }

    dropCheckConstraints(
        table: Table | string,
        checkConstraints: TableCheck[],
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Check constraints is not supported by Firestore.`,
        )
    }

    createExclusionConstraint(
        table: Table | string,
        exclusionConstraint: TableExclusion,
    ): Promise<void> {
        throw new TypeORMError(
            `Exclusion constraints is not supported by Firestore.`,
        )
    }

    createExclusionConstraints(
        table: Table | string,
        exclusionConstraints: TableExclusion[],
    ): Promise<void> {
        throw new TypeORMError(
            `Exclusion constraints is not supported by Firestore.`,
        )
    }

    dropExclusionConstraint(
        table: Table | string,
        exclusionOrName: TableExclusion | string,
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Exclusion constraints is not supported by Firestore.`,
        )
    }

    dropExclusionConstraints(
        table: Table | string,
        exclusionConstraints: TableExclusion[],
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(
            `Exclusion constraints is not supported by Firestore.`,
        )
    }

    createForeignKey(
        table: Table | string,
        foreignKey: TableForeignKey,
    ): Promise<void> {
        throw new TypeORMError(`Foreign keys is not supported by Firestore.`)
    }

    createForeignKeys(
        table: Table | string,
        foreignKeys: TableForeignKey[],
    ): Promise<void> {
        throw new TypeORMError(`Foreign keys is not supported by Firestore.`)
    }

    dropForeignKey(
        table: Table | string,
        foreignKeyOrName: TableForeignKey | string,
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(`Foreign keys is not supported by Firestore.`)
    }

    dropForeignKeys(
        table: Table | string,
        foreignKeys: TableForeignKey[],
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(`Foreign keys is not supported by Firestore.`)
    }

    createIndex(table: Table | string, index: TableIndex): Promise<void> {
        throw new TypeORMError(`Indices is not supported by Firestore.`)
    }

    createIndices(table: Table | string, indices: TableIndex[]): Promise<void> {
        throw new TypeORMError(`Indices is not supported by Firestore.`)
    }

    dropIndex(
        table: Table | string,
        index: TableIndex | string,
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(`Indices is not supported by Firestore.`)
    }

    dropIndices(
        table: Table | string,
        indices: TableIndex[],
        ifExists?: boolean,
    ): Promise<void> {
        throw new TypeORMError(`Indices is not supported by Firestore.`)
    }

    clearTable(
        tableName: string,
        options?: { cascade?: boolean },
    ): Promise<void> {
        throw new TypeORMError(`Clearing tables is not supported by Firestore.`)
    }

    enableSqlMemory(): void {
        throw new TypeORMError(`SQL memory is not supported by Firestore.`)
    }

    disableSqlMemory(): void {
        throw new TypeORMError(`SQL memory is not supported by Firestore.`)
    }

    clearSqlMemory(): void {
        throw new TypeORMError(`SQL memory is not supported by Firestore.`)
    }

    getMemorySql(): SqlInMemory {
        throw new TypeORMError(`SQL memory is not supported by Firestore.`)
    }

    executeMemoryUpSql(): Promise<void> {
        throw new TypeORMError(`SQL memory is not supported by Firestore.`)
    }

    executeMemoryDownSql(): Promise<void> {
        throw new TypeORMError(`SQL memory is not supported by Firestore.`)
    }
}
