import "reflect-metadata"
import { expect } from "chai"
import type { DataSource } from "../../../../src/data-source/DataSource"
import type { FirestoreDriver } from "../../../../src/driver/firestore/FirestoreDriver"
import { FirestoreEntityManager } from "../../../../src/entity-manager/FirestoreEntityManager"
import { EntityNotFoundError } from "../../../../src/error/EntityNotFoundError"
import { In } from "../../../../src/find-options/operator/In"
import { FirestoreRepository } from "../../../../src/repository/FirestoreRepository"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { Post } from "./entity/Post"

describe("firestore > repository > read", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [Post],
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
})
