import type { ObjectLiteral } from "../../common/ObjectLiteral"
import type { DataSource } from "../../data-source/DataSource"
import { TypeORMError } from "../../error"
import { ConnectionIsNotSetError } from "../../error/ConnectionIsNotSetError"
import { DriverPackageNotInstalledError } from "../../error/DriverPackageNotInstalledError"
import type { ColumnMetadata } from "../../metadata/ColumnMetadata"
import type { EntityMetadata } from "../../metadata/EntityMetadata"
import { PlatformTools } from "../../platform/PlatformTools"
import { FirestoreSchemaBuilder } from "../../schema-builder/FirestoreSchemaBuilder"
import type { Table } from "../../schema-builder/table/Table"
import type { TableColumn } from "../../schema-builder/table/TableColumn"
import type { TableForeignKey } from "../../schema-builder/table/TableForeignKey"
import type { View } from "../../schema-builder/view/View"
import { ApplyValueTransformers } from "../../util/ApplyValueTransformers"
import { RandomGenerator } from "../../util/RandomGenerator"
import { InstanceChecker } from "../../util/InstanceChecker"
import type { Driver } from "../Driver"
import type { ColumnType } from "../types/ColumnTypes"
import type { CteCapabilities } from "../types/CteCapabilities"
import type { DataTypeDefaults } from "../types/DataTypeDefaults"
import type { IsolationLevel } from "../types/IsolationLevel"
import type { MappedColumnTypes } from "../types/MappedColumnTypes"
import type { ReplicationMode } from "../types/ReplicationMode"
import type { UpsertType } from "../types/UpsertType"
import { AdminFirestoreAdapter } from "./AdminFirestoreAdapter"
import type { FirestoreAdapter } from "./FirestoreAdapter"
import type { FirestoreDataSourceOptions } from "./FirestoreDataSourceOptions"
import { FirestoreQueryRunner } from "./FirestoreQueryRunner"

/**
 * Organizes communication with Firestore.
 */
export class FirestoreDriver implements Driver {
    static readonly supportedIsolationLevels: IsolationLevel[] = []

    supportedIsolationLevels = FirestoreDriver.supportedIsolationLevels

    appModule: any

    firestoreModule: any

    adapter: FirestoreAdapter

    options: FirestoreDataSourceOptions

    database?: string

    isReplicated: boolean = false

    treeSupport = false

    transactionSupport = "simple" as const

    supportedDataTypes: ColumnType[] = [
        "string",
        "varchar",
        "text",
        "uuid",
        "int",
        "integer",
        "float",
        "double",
        "number",
        "boolean",
        "date",
        "datetime",
        "timestamp",
        "json",
        "simple-json",
        "simple-array",
        "array",
    ]

    supportedUpsertTypes: UpsertType[] = []

    spatialTypes: ColumnType[] = []

    withLengthColumnTypes: ColumnType[] = []

    withPrecisionColumnTypes: ColumnType[] = []

    withScaleColumnTypes: ColumnType[] = []

    mappedDataTypes: MappedColumnTypes = {
        createDate: "timestamp",
        createDateDefault: "",
        updateDate: "timestamp",
        updateDateDefault: "",
        deleteDate: "timestamp",
        deleteDateNullable: true,
        version: "int",
        treeLevel: "int",
        migrationId: "int",
        migrationName: "string",
        migrationTimestamp: "int",
        cacheId: "int",
        cacheIdentifier: "string",
        cacheTime: "int",
        cacheDuration: "int",
        cacheQuery: "string",
        cacheResult: "string",
        metadataType: "string",
        metadataDatabase: "string",
        metadataSchema: "string",
        metadataTable: "string",
        metadataName: "string",
        metadataValue: "string",
    }

    dataTypeDefaults: DataTypeDefaults

    maxAliasLength?: number

    cteCapabilities: CteCapabilities = {
        enabled: false,
    }

    constructor(protected dataSource: DataSource) {
        this.options = dataSource.options as FirestoreDataSourceOptions
        this.loadDependencies()
        this.database = this.options.databaseId
    }

    async connect(): Promise<void> {
        let firestore: any
        let onClose: () => Promise<void> = async () => {}

        if (this.options.firestore) {
            firestore = this.options.firestore
        } else {
            const app = this.appModule.initializeApp(
                {
                    projectId: this.options.projectId,
                    ...(this.options.credential
                        ? { credential: this.options.credential }
                        : {}),
                },
                `typeorm-${RandomGenerator.uuidv4()}`,
            )
            try {
                firestore = this.firestoreModule.getFirestore(
                    app,
                    this.options.databaseId ?? "(default)",
                )
            } catch (error) {
                await this.appModule.deleteApp(app).catch(() => undefined)
                throw error
            }
            onClose = () => this.appModule.deleteApp(app)
        }

        this.adapter = new AdminFirestoreAdapter(
            firestore,
            this.firestoreModule.FieldPath,
            onClose,
        )
    }

    afterConnect(): Promise<void> {
        return Promise.resolve()
    }

    async disconnect(): Promise<void> {
        if (!this.adapter) {
            throw new ConnectionIsNotSetError("firestore")
        }

        const adapter = this.adapter
        this.adapter = undefined as any
        await adapter.close()
    }

    createSchemaBuilder() {
        return new FirestoreSchemaBuilder()
    }

    createQueryRunner(mode: ReplicationMode) {
        return new FirestoreQueryRunner(this.dataSource, this.adapter)
    }

    escapeQueryWithParameters(
        sql: string,
        parameters: ObjectLiteral,
    ): [string, any[]] {
        throw new TypeORMError(`SQL escaping is not supported by Firestore.`)
    }

    escape(columnName: string): string {
        return columnName
    }

    buildTableName(
        tableName: string,
        schema?: string,
        database?: string,
    ): string {
        return tableName
    }

    parseTableName(
        target: EntityMetadata | Table | View | TableForeignKey | string,
    ): { tableName: string; schema?: string; database?: string } {
        if (InstanceChecker.isEntityMetadata(target)) {
            return { tableName: target.tableName }
        }

        if (InstanceChecker.isTable(target) || InstanceChecker.isView(target)) {
            return { tableName: target.name }
        }

        if (InstanceChecker.isTableForeignKey(target)) {
            return { tableName: target.referencedTableName }
        }

        return { tableName: target }
    }

    preparePersistentValue(value: any, columnMetadata: ColumnMetadata): any {
        if (columnMetadata.transformer)
            value = ApplyValueTransformers.transformTo(
                columnMetadata.transformer,
                value,
            )
        return value
    }

    prepareHydratedValue(value: any, columnMetadata: ColumnMetadata): any {
        if (value && typeof value.toDate === "function") {
            value = value.toDate()
        }
        if (columnMetadata.transformer)
            value = ApplyValueTransformers.transformFrom(
                columnMetadata.transformer,
                value,
            )
        return value
    }

    normalizeType(column: {
        type?: ColumnType
        length?: number | string
        precision?: number | null
        scale?: number
    }): string {
        if (column.type === Number) {
            return "number"
        } else if (column.type === String) {
            return "string"
        } else if (column.type === Boolean) {
            return "boolean"
        } else if (column.type === Date) {
            return "timestamp"
        } else if (column.type === "simple-enum") {
            return "string"
        }
        return (column.type as string) || ""
    }

    normalizeDefault(columnMetadata: ColumnMetadata): string | undefined {
        throw new TypeORMError(
            `Default value normalization is not supported by Firestore.`,
        )
    }

    normalizeIsUnique(column: ColumnMetadata): boolean {
        throw new TypeORMError(
            `Unique normalization is not supported by Firestore.`,
        )
    }

    getColumnLength(column: ColumnMetadata): string {
        throw new TypeORMError(`Column length is not supported by Firestore.`)
    }

    createFullType(column: TableColumn): string {
        throw new TypeORMError(
            `Full type creation is not supported by Firestore.`,
        )
    }

    obtainMasterConnection(): Promise<any> {
        return Promise.resolve()
    }

    obtainSlaveConnection(): Promise<any> {
        return Promise.resolve()
    }

    createGeneratedMap(metadata: EntityMetadata, insertedId: any) {
        return undefined
    }

    findChangedColumns(
        tableColumns: TableColumn[],
        columnMetadatas: ColumnMetadata[],
    ): ColumnMetadata[] {
        throw new TypeORMError(
            `Changed column detection is not supported by Firestore.`,
        )
    }

    isReturningSqlSupported(): boolean {
        return false
    }

    isUUIDGenerationSupported(): boolean {
        return false
    }

    isFullTextColumnTypeSupported(): boolean {
        return false
    }

    createParameter(parameterName: string, index: number): string {
        return ""
    }

    protected loadDependencies(): void {
        try {
            if (this.options.driver) {
                this.appModule = this.options.driver
                this.firestoreModule = this.options.driver
            } else {
                this.appModule = PlatformTools.load("firebase-admin/app")
                this.firestoreModule = PlatformTools.load(
                    "firebase-admin/firestore",
                )
            }
        } catch (e) {
            throw new DriverPackageNotInstalledError(
                "Firestore",
                "firebase-admin",
            )
        }
    }
}
