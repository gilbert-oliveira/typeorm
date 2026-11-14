import type { DataSource } from "../data-source/DataSource"
import type { EntityTarget } from "../common/EntityTarget"
import type { ObjectLiteral } from "../common/ObjectLiteral"
import { assertValidDocumentId } from "../driver/firestore/FirestoreDocumentId"
import { FirestoreFindOptionsTranslator } from "../driver/firestore/FirestoreFindOptionsTranslator"
import type {
    FirestoreDocument,
    FirestoreWriteOperation,
} from "../driver/firestore/FirestoreAdapter"
import type { FirestoreDriver } from "../driver/firestore/FirestoreDriver"
import type { FirestoreQueryRunner } from "../driver/firestore/FirestoreQueryRunner"
import type { FindManyOptions } from "../find-options/FindManyOptions"
import type { FindOneOptions } from "../find-options/FindOneOptions"
import type { FindOptionsWhere } from "../find-options/FindOptionsWhere"
import type { EntityMetadata } from "../metadata/EntityMetadata"
import type { QueryRunner } from "../query-runner/QueryRunner"
import { EntityManager } from "./EntityManager"
import { TypeORMError } from "../error/TypeORMError"
import { DeleteResult } from "../query-builder/result/DeleteResult"
import { InsertResult } from "../query-builder/result/InsertResult"
import { UpdateResult } from "../query-builder/result/UpdateResult"
import type { QueryDeepPartialEntity } from "../query-builder/QueryPartialEntity"
import { RandomGenerator } from "../util/RandomGenerator"

export class FirestoreEntityManager extends EntityManager {
    readonly "@instanceof" = Symbol.for("FirestoreEntityManager")

    private defaultQueryRunner?: FirestoreQueryRunner

    constructor(dataSource: DataSource, queryRunner?: QueryRunner) {
        super(dataSource, queryRunner)
    }

    get firestoreQueryRunner(): FirestoreQueryRunner {
        if (this.queryRunner) return this.queryRunner as FirestoreQueryRunner
        this.defaultQueryRunner ??= this.dataSource.driver.createQueryRunner(
            "master",
        ) as FirestoreQueryRunner
        return this.defaultQueryRunner
    }

    async find<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        options?: FindManyOptions<Entity>,
    ): Promise<Entity[]> {
        const metadata = this.dataSource.getMetadata(entityClass)
        const query = this.translator().translate(metadata, options)
        const runner = this.firestoreQueryRunner
        const documents = await runner.adapter.runQuery(
            query,
            runner.transaction,
        )
        return this.hydrate<Entity>(metadata, documents)
    }

    async findBy<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
    ): Promise<Entity[]> {
        return this.find(entityClass, { where })
    }

    async findOne<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        options: FindOneOptions<Entity>,
    ): Promise<Entity | null> {
        if (!options.where) {
            throw new Error(
                `You must provide selection conditions in order to find a single row.`,
            )
        }
        const [entity] = await this.find(entityClass, {
            ...options,
            take: 1,
        })
        return entity ?? null
    }

    async findOneBy<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
    ): Promise<Entity | null> {
        return this.findOne(entityClass, { where })
    }

    async findAndCount<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        options?: FindManyOptions<Entity>,
    ): Promise<[Entity[], number]> {
        const entities = await this.find(entityClass, options)
        const total = await this.count(entityClass, options)
        return [entities, total]
    }

    async findAndCountBy<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
    ): Promise<[Entity[], number]> {
        return this.findAndCount(entityClass, { where })
    }

    async count<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        options?: FindManyOptions<Entity>,
    ): Promise<number> {
        const metadata = this.dataSource.getMetadata(entityClass)
        const query = this.translator().translate(metadata, options)
        const runner = this.firestoreQueryRunner
        return runner.adapter.count(query, runner.transaction)
    }

    async countBy<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
    ): Promise<number> {
        return this.count(entityClass, { where })
    }

    async exists<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        options?: FindManyOptions<Entity>,
    ): Promise<boolean> {
        const metadata = this.dataSource.getMetadata(entityClass)
        const query = this.translator().translate(metadata, options)
        query.limit = 1
        query.offset = undefined
        query.select = []
        const runner = this.firestoreQueryRunner
        const documents = await runner.adapter.runQuery(
            query,
            runner.transaction,
        )
        return documents.length > 0
    }

    async existsBy<Entity extends ObjectLiteral>(
        entityClass: EntityTarget<Entity>,
        where: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
    ): Promise<boolean> {
        return this.exists(entityClass, { where })
    }

    async insert<Entity extends ObjectLiteral>(
        target: EntityTarget<Entity>,
        entity:
            QueryDeepPartialEntity<Entity> | QueryDeepPartialEntity<Entity>[],
    ): Promise<InsertResult> {
        const metadata = this.dataSource.getMetadata(target)
        const driver = this.dataSource.driver as FirestoreDriver
        const primary = metadata.primaryColumns[0]
        const entities = Array.isArray(entity) ? entity : [entity]
        const result = new InsertResult()
        const operations: FirestoreWriteOperation[] = []

        for (const item of entities) {
            let id = primary.getEntityValue(item)
            let generated = false
            if (
                (id === undefined || id === null || id === "") &&
                primary.generationStrategy === "uuid"
            ) {
                id = RandomGenerator.uuidv4()
                generated = true
            }
            assertValidDocumentId(id)

            const data: Record<string, unknown> = {}
            for (const column of metadata.columns) {
                if (column.isPrimary || column.isVirtual) continue
                let value = column.getEntityValue(item)
                if (value === undefined) {
                    if (column.isCreateDate || column.isUpdateDate) {
                        value = new Date()
                    } else if (column.isNullable) {
                        value = null
                    } else {
                        continue
                    }
                }
                data[column.databaseName] = driver.preparePersistentValue(
                    value,
                    column,
                )
            }

            operations.push({
                type: "create",
                collection: metadata.tableName,
                id,
                data,
            })
            result.identifiers.push({ [primary.propertyName]: id })
            result.generatedMaps.push(
                generated ? { [primary.propertyName]: id } : {},
            )
        }

        const runner = this.firestoreQueryRunner
        await runner.adapter.write(operations, runner.transaction)
        return result
    }

    async update<Entity extends ObjectLiteral>(
        target: EntityTarget<Entity>,
        criteria: string | string[] | FindOptionsWhere<Entity>,
        partialEntity: QueryDeepPartialEntity<Entity>,
    ): Promise<UpdateResult> {
        const metadata = this.dataSource.getMetadata(target)
        const driver = this.dataSource.driver as FirestoreDriver
        const ids = await this.resolveDocumentIds(metadata, criteria)

        const data: Record<string, unknown> = {}
        for (const column of metadata.columns) {
            if (column.isPrimary || column.isVirtual) continue
            let value = column.getEntityValue(partialEntity)
            if (value === undefined) {
                if (!column.isUpdateDate) continue
                value = new Date()
            }
            data[column.databaseName] = driver.preparePersistentValue(
                value,
                column,
            )
        }

        const result = new UpdateResult()
        result.affected = ids.length
        result.raw = []
        if (ids.length === 0 || Object.keys(data).length === 0) return result

        const runner = this.firestoreQueryRunner
        await runner.adapter.write(
            ids.map((id) => ({
                type: "update" as const,
                collection: metadata.tableName,
                id,
                data,
            })),
            runner.transaction,
        )
        return result
    }

    async delete<Entity extends ObjectLiteral>(
        target: EntityTarget<Entity>,
        criteria: string | string[] | FindOptionsWhere<Entity>,
    ): Promise<DeleteResult> {
        const metadata = this.dataSource.getMetadata(target)
        const ids = await this.resolveDocumentIds(metadata, criteria)
        const result = new DeleteResult()
        result.affected = ids.length
        result.raw = []
        if (ids.length === 0) return result

        const runner = this.firestoreQueryRunner
        await runner.adapter.write(
            ids.map((id) => ({
                type: "delete" as const,
                collection: metadata.tableName,
                id,
            })),
            runner.transaction,
        )
        return result
    }

    async findByIdsInternal<Entity extends ObjectLiteral>(
        target: EntityTarget<Entity>,
        ids: string[],
    ): Promise<Entity[]> {
        const metadata = this.dataSource.getMetadata(target)
        ids.forEach((id) => assertValidDocumentId(id))
        const runner = this.firestoreQueryRunner
        const documents = await runner.adapter.getDocuments(
            metadata.tableName,
            ids,
            runner.transaction,
        )
        return this.hydrate<Entity>(metadata, documents)
    }

    protected async hydrate<Entity extends ObjectLiteral>(
        metadata: EntityMetadata,
        documents: FirestoreDocument[],
    ): Promise<Entity[]> {
        if (documents.length === 0) return []
        const driver = this.dataSource.driver as FirestoreDriver
        const entities = documents.map((document) => {
            const entity = metadata.create(undefined, {
                fromDeserializer: true,
            })
            for (const column of metadata.columns) {
                if (column.isVirtual) continue
                if (column.isPrimary) {
                    column.setEntityValue(
                        entity,
                        driver.prepareHydratedValue(document.id, column),
                    )
                    continue
                }
                const value = document.data[column.databaseName]
                if (value === undefined) continue
                column.setEntityValue(
                    entity,
                    driver.prepareHydratedValue(value, column),
                )
            }
            return entity as Entity
        })
        await this.firestoreQueryRunner.broadcaster.broadcast(
            "Load",
            metadata,
            entities,
        )
        return entities
    }

    private async resolveDocumentIds(
        metadata: EntityMetadata,
        criteria: unknown,
    ): Promise<string[]> {
        if (
            criteria === undefined ||
            criteria === null ||
            criteria === "" ||
            (Array.isArray(criteria) && criteria.length === 0)
        ) {
            throw new TypeORMError(
                `Empty criteria(s) are not allowed for the Firestore write operations.`,
            )
        }

        const primary = metadata.primaryColumns[0]
        const items = Array.isArray(criteria) ? criteria : [criteria]
        const directIds: string[] = []
        for (const item of items) {
            if (typeof item === "string") {
                directIds.push(item)
                continue
            }
            const keys =
                item && typeof item === "object" ? Object.keys(item) : []
            const value =
                keys.length === 1 && keys[0] === primary.propertyName
                    ? (item as ObjectLiteral)[keys[0]]
                    : undefined
            if (typeof value !== "string") break
            directIds.push(value)
        }

        if (directIds.length === items.length) {
            directIds.forEach((id) => assertValidDocumentId(id))
            const uniqueIds = [...new Set(directIds)]
            const existing =
                await this.firestoreQueryRunner.adapter.getDocuments(
                    metadata.tableName,
                    uniqueIds,
                    this.firestoreQueryRunner.transaction,
                )
            return existing.map((document) => document.id)
        }

        const query = this.translator().translate(metadata, {
            where: criteria as FindOptionsWhere<ObjectLiteral>,
        })
        query.select = []
        const runner = this.firestoreQueryRunner
        const documents = await runner.adapter.runQuery(
            query,
            runner.transaction,
        )
        return documents.map((document) => document.id)
    }

    private translator(): FirestoreFindOptionsTranslator {
        return new FirestoreFindOptionsTranslator(
            this.dataSource.driver as FirestoreDriver,
        )
    }
}
