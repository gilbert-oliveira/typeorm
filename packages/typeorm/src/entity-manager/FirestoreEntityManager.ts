import type { DataSource } from "../data-source/DataSource"
import type { EntityTarget } from "../common/EntityTarget"
import type { ObjectLiteral } from "../common/ObjectLiteral"
import { FirestoreFindOptionsTranslator } from "../driver/firestore/FirestoreFindOptionsTranslator"
import type { FirestoreDocument } from "../driver/firestore/FirestoreAdapter"
import type { FirestoreDriver } from "../driver/firestore/FirestoreDriver"
import type { FirestoreQueryRunner } from "../driver/firestore/FirestoreQueryRunner"
import type { FindManyOptions } from "../find-options/FindManyOptions"
import type { FindOneOptions } from "../find-options/FindOneOptions"
import type { FindOptionsWhere } from "../find-options/FindOptionsWhere"
import type { EntityMetadata } from "../metadata/EntityMetadata"
import type { QueryRunner } from "../query-runner/QueryRunner"
import { EntityManager } from "./EntityManager"

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

    async findByIdsInternal<Entity extends ObjectLiteral>(
        target: EntityTarget<Entity>,
        ids: string[],
    ): Promise<Entity[]> {
        const metadata = this.dataSource.getMetadata(target)
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

    private translator(): FirestoreFindOptionsTranslator {
        return new FirestoreFindOptionsTranslator(
            this.dataSource.driver as FirestoreDriver,
        )
    }
}
