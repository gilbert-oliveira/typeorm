import "reflect-metadata"
import { expect } from "chai"
import type { DataSource } from "../../../../src/data-source/DataSource"
import type { FirestoreDriver } from "../../../../src/driver/firestore/FirestoreDriver"
import { FirestoreEntityManager } from "../../../../src/entity-manager/FirestoreEntityManager"
import { EntityNotFoundError } from "../../../../src/error/EntityNotFoundError"
import { In } from "../../../../src/find-options/operator/In"
import { IsNull } from "../../../../src/find-options/operator/IsNull"
import { LessThan } from "../../../../src/find-options/operator/LessThan"
import { LessThanOrEqual } from "../../../../src/find-options/operator/LessThanOrEqual"
import { MoreThan } from "../../../../src/find-options/operator/MoreThan"
import { MoreThanOrEqual } from "../../../../src/find-options/operator/MoreThanOrEqual"
import { Not } from "../../../../src/find-options/operator/Not"
import { FirestoreRepository } from "../../../../src/repository/FirestoreRepository"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { Post } from "./entity/Post"
import { Product } from "./entity/Product"

describe("firestore > repository > read", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [Post, Product],
            enabledDrivers: ["firestore"],
            schemaCreate: true,
            dropSchema: true,
        })
    })
    beforeEach(async () => {
        await reloadTestingDatabases(dataSources)
        await Promise.all(
            dataSources.map((dataSource) =>
                (dataSource.driver as FirestoreDriver).adapter.write(
                    ["a", "b", "c"].map((title, index) => ({
                        type: "create" as const,
                        collection: "post",
                        id: String(index + 1),
                        data: { title },
                    })),
                ),
            ),
        )
    })
    after(() => closeTestingConnections(dataSources))

    it("should provide firestore repository and manager", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                expect(dataSource.getRepository(Post)).to.be.instanceOf(
                    FirestoreRepository,
                )
                expect(dataSource.firestoreManager).to.be.instanceOf(
                    FirestoreEntityManager,
                )
            }),
        ))

    it("should find ordered entities as instances", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const posts = await dataSource
                    .getRepository(Post)
                    .find({ order: { title: "ASC" } })
                expect(posts.map((post) => post.title)).to.deep.equal([
                    "a",
                    "b",
                    "c",
                ])
                posts.forEach((post) => expect(post).to.be.instanceOf(Post))
                expect(posts[0].id).to.equal("1")
            }),
        ))

    it("should filter by primary column as document id", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(Post)
                const post = await repository.findOneBy({ id: "2" })
                expect(post!.title).to.equal("b")
                const posts = await repository.findBy({ id: In(["1", "3"]) })
                expect(posts).to.have.length(2)
            }),
        ))

    it("should return null or throw when entity is missing", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(Post)
                expect(await repository.findOneBy({ id: "x" })).to.be.null
                let error: unknown
                await repository.findOneByOrFail({ id: "x" }).catch((e) => {
                    error = e
                })
                expect(error).to.be.instanceOf(EntityNotFoundError)
            }),
        ))

    it("should count and check existence", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(Post)
                expect(await repository.count()).to.equal(3)
                expect(await repository.countBy({ title: "a" })).to.equal(1)
                expect(await repository.exists({ where: { title: "z" } })).to.be
                    .false
                expect(await repository.existsBy({ title: "a" })).to.be.true
                const [posts, total] = await repository.findAndCount({
                    take: 2,
                    order: { title: "ASC" },
                })
                expect(posts).to.have.length(2)
                expect(total).to.equal(3)
            }),
        ))

    it("should call AfterLoad listeners", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const post = await dataSource
                    .getRepository(Post)
                    .findOneBy({ id: "1" })
                expect(post!.loaded).to.be.true
            }),
        ))

    it("should provide the manager to AfterLoad subscribers", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const managers: unknown[] = []
                const subscriber = {
                    afterLoad(entity: unknown, event?: { manager?: unknown }) {
                        managers.push(event?.manager)
                    },
                }
                dataSource.subscribers.push(subscriber)
                try {
                    await dataSource.getRepository(Post).findOneBy({ id: "1" })
                } finally {
                    dataSource.subscribers.splice(
                        dataSource.subscribers.indexOf(subscriber),
                        1,
                    )
                }
                expect(managers).to.have.length(1)
                expect(managers[0]).to.be.instanceOf(FirestoreEntityManager)
            }),
        ))

    it("should return only ids when only the primary column is selected", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const posts = await dataSource.getRepository(Post).find({
                    select: { id: true },
                    order: { id: "ASC" },
                })
                expect(posts.map((post) => post.id)).to.deep.equal([
                    "1",
                    "2",
                    "3",
                ])
                posts.forEach((post) => expect(post.title).to.be.undefined)
            }),
        ))

    it("should not support raw queries and query builder", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                let queryError: Error | undefined
                await dataSource.query("x").catch((e) => {
                    queryError = e
                })
                expect(queryError!.message).to.contain(
                    "is not supported by Firestore.",
                )
                expect(() => dataSource.createQueryBuilder()).to.throw(
                    "is not supported by Firestore.",
                )
            }),
        ))

    describe("operators", () => {
        beforeEach(async () => {
            await Promise.all(
                dataSources.map((dataSource) =>
                    (dataSource.driver as FirestoreDriver).adapter.write(
                        [
                            {
                                id: "1",
                                data: {
                                    name: "a",
                                    score: 10,
                                    releasedAt: new Date("2020-01-01"),
                                },
                            },
                            {
                                id: "2",
                                data: {
                                    name: "b",
                                    score: 20,
                                    releasedAt: new Date("2021-01-01"),
                                },
                            },
                            {
                                id: "3",
                                data: {
                                    name: "c",
                                    score: 30,
                                    releasedAt: new Date("2022-01-01"),
                                },
                            },
                            {
                                id: "4",
                                data: {
                                    name: "d",
                                    score: null,
                                    releasedAt: null,
                                },
                            },
                            { id: "5", data: { name: "e" } },
                        ].map(({ id, data }) => ({
                            type: "create" as const,
                            collection: "product",
                            id,
                            data,
                        })),
                    ),
                ),
            )
        })

        const idsOf = (products: Product[]) =>
            products.map((product) => product.id).sort()

        const expectIds = (
            where: any,
            expected: string[],
            extra: Record<string, unknown> = {},
        ) =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    const products = await dataSource
                        .getRepository(Product)
                        .find({ where, ...extra })
                    expect(idsOf(products)).to.deep.equal(expected)
                }),
            )

        it("should filter with Not(value)", () =>
            expectIds({ name: Not("a") }, ["2", "3", "4", "5"]))

        it("should filter with Not(value) on the primary column", () =>
            expectIds({ id: Not("1") }, ["2", "3", "4", "5"]))

        it("should filter with Not(In)", () =>
            expectIds({ name: Not(In(["a", "b"])) }, ["3", "4", "5"]))

        it("should filter with Not(In) on the primary column", () =>
            expectIds({ id: Not(In(["1", "2"])) }, ["3", "4", "5"]))

        it("should match only explicit nulls with IsNull", () =>
            expectIds({ score: IsNull() }, ["4"]))

        it("should exclude nulls and missing fields with Not(IsNull)", () =>
            expectIds({ score: Not(IsNull()) }, ["1", "2", "3"]))

        it("should filter with MoreThan", () =>
            expectIds({ score: MoreThan(10) }, ["2", "3"]))

        it("should filter with MoreThanOrEqual", () =>
            expectIds({ score: MoreThanOrEqual(20) }, ["2", "3"]))

        it("should filter with LessThan", () =>
            expectIds({ score: LessThan(30) }, ["1", "2"]))

        it("should filter with LessThanOrEqual", () =>
            expectIds({ score: LessThanOrEqual(20) }, ["1", "2"]))

        it("should filter by Date equality", () =>
            expectIds({ releasedAt: new Date("2021-01-01") }, ["2"]))

        it("should filter by Date comparison", () =>
            expectIds({ releasedAt: MoreThan(new Date("2020-06-01")) }, [
                "2",
                "3",
            ]))

        it("should read Date columns back as Date", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    const product = await dataSource
                        .getRepository(Product)
                        .findOneBy({ id: "1" })
                    expect(product!.releasedAt).to.be.instanceOf(Date)
                    expect(product!.releasedAt!.toISOString()).to.equal(
                        "2020-01-01T00:00:00.000Z",
                    )
                }),
            ))

        it("should skip documents", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    const products = await dataSource
                        .getRepository(Product)
                        .find({ order: { name: "ASC" }, skip: 2, take: 2 })
                    expect(
                        products.map((product) => product.name),
                    ).to.deep.equal(["c", "d"])
                }),
            ))

        it("should select only the requested columns", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    const product = await dataSource
                        .getRepository(Product)
                        .findOne({
                            where: { id: "1" },
                            select: { name: true },
                        })
                    expect(product!.id).to.equal("1")
                    expect(product!.name).to.equal("a")
                    expect(product!.score).to.be.undefined
                    expect(product!.releasedAt).to.be.undefined
                }),
            ))
    })
})
