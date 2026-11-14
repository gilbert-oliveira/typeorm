import "reflect-metadata"
import { expect } from "chai"
import type { DataSource } from "../../../../src/data-source/DataSource"
import type { FirestoreDriver } from "../../../../src/driver/firestore/FirestoreDriver"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { Tag } from "./entity/Tag"
import { WritePost } from "./entity/WritePost"

describe("firestore > repository > write", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [WritePost, Tag],
            enabledDrivers: ["firestore"],
            schemaCreate: true,
            dropSchema: true,
        })
    })
    beforeEach(async () => {
        await reloadTestingDatabases(dataSources)
        WritePost.beforeInsertCalls = 0
        WritePost.afterUpdateCalls = 0
    })
    after(() => closeTestingConnections(dataSources))

    const adapterOf = (dataSource: DataSource) =>
        (dataSource.driver as FirestoreDriver).adapter

    it("should save a new entity and load it back", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(WritePost)
                await repository.save(new WritePost({ id: "1", title: "a" }))
                const loaded = await repository.findOneBy({ id: "1" })
                expect(loaded!.title).to.equal("a")
                expect(loaded!.createdAt).to.be.instanceOf(Date)
                expect(loaded!.text).to.equal(null)
                expect(WritePost.beforeInsertCalls).to.equal(1)
            }),
        ))

    it("should not store the primary column in the document", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                await dataSource
                    .getRepository(WritePost)
                    .save(new WritePost({ id: "1", title: "a" }))
                const [document] = await adapterOf(dataSource).getDocuments(
                    "post",
                    ["1"],
                )
                expect(document.data).to.not.have.property("id")
                expect((document.data.createdAt as any).toDate).to.be.a(
                    "function",
                )
            }),
        ))

    it("should generate uuid primary keys", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const tag = await dataSource
                    .getRepository(Tag)
                    .save(new Tag({ name: "x" }))
                expect(tag.id).to.match(
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
                )
                const documents = await adapterOf(dataSource).getDocuments(
                    "tag",
                    [tag.id],
                )
                expect(documents).to.have.length(1)
            }),
        ))

    it("should update only changed columns on save", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(WritePost)
                await repository.save(new WritePost({ id: "1", title: "a" }))
                await adapterOf(dataSource).write([
                    {
                        type: "merge",
                        collection: "post",
                        id: "1",
                        data: { text: "keep" },
                    },
                ])
                const post = (await repository.findOneBy({ id: "1" }))!
                post.title = "b"
                post.text = undefined
                await repository.save(post)
                const [document] = await adapterOf(dataSource).getDocuments(
                    "post",
                    ["1"],
                )
                expect(document.data.title).to.equal("b")
                expect(document.data.text).to.equal("keep")
                expect(WritePost.afterUpdateCalls).to.equal(1)
            }),
        ))

    it("should update by criteria", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(WritePost)
                await repository.save(new WritePost({ id: "1", title: "a" }))
                const result = await repository.update(
                    { title: "a" },
                    { title: "z" },
                )
                expect(result.affected).to.equal(1)
                expect(
                    (await repository.findOneBy({ id: "1" }))!.title,
                ).to.equal("z")
            }),
        ))

    it("should delete and remove", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(WritePost)
                await repository.save([
                    new WritePost({ id: "1", title: "a" }),
                    new WritePost({ id: "2", title: "b" }),
                ])
                await repository.delete(["1"])
                expect(await repository.count()).to.equal(1)
                const post = (await repository.findOneBy({ id: "2" }))!
                await repository.remove(post)
                expect(await repository.count()).to.equal(0)
            }),
        ))

    it("should reject insert of an existing id", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(WritePost)
                await repository.save(new WritePost({ id: "1", title: "a" }))
                let error: unknown
                try {
                    await repository.insert({ id: "1", title: "b" })
                } catch (e) {
                    error = e
                }
                expect(error).to.be.instanceOf(Error)
            }),
        ))

    it("should reject invalid document ids", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(WritePost)
                for (const id of ["a/b", ".", "..", "", "__x__"]) {
                    let message = ""
                    try {
                        await repository.save(new WritePost({ id, title: "a" }))
                    } catch (e) {
                        message = (e as Error).message
                    }
                    expect(message).to.contain("Invalid Firestore document id")
                }
            }),
        ))

    it("should save more than 500 entities without a transaction", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(WritePost)
                const posts = Array.from(
                    { length: 510 },
                    (_, index) =>
                        new WritePost({ id: `p${index}`, title: `t${index}` }),
                )
                await repository.save(posts, { transaction: false })
                expect(await repository.count()).to.equal(510)
            }),
        ))
})
