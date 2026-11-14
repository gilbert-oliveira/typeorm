import "reflect-metadata"
import { expect } from "chai"
import type { DataSource } from "../../../../src/data-source/DataSource"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { TxPost } from "./entity/TxPost"

describe("firestore > transaction", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [TxPost],
            enabledDrivers: ["firestore"],
            schemaCreate: true,
            dropSchema: true,
        })
    })
    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    const post = (id: string, title = id) => {
        const entity = new TxPost()
        entity.id = id
        entity.title = title
        entity.counter = 0
        return entity
    }

    it("should commit saves made inside a transaction", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                await dataSource.transaction((m) =>
                    m.save([post("1"), post("2")]),
                )
                expect(await dataSource.getRepository(TxPost).count()).to.equal(
                    2,
                )
            }),
        ))

    it("should save a new and an existing entity in one transaction", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                await dataSource.getRepository(TxPost).save(post("1", "old"))
                await dataSource.transaction((m) =>
                    m.save([post("2"), post("1", "new")]),
                )
                const loaded = await dataSource
                    .getRepository(TxPost)
                    .findOneBy({ id: "1" })
                expect(loaded!.title).to.equal("new")
                expect(await dataSource.getRepository(TxPost).count()).to.equal(
                    2,
                )
            }),
        ))

    it("should remove entities inside a transaction", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(TxPost)
                const posts = [post("1"), post("2")]
                await repository.save(posts)
                await dataSource.transaction((m) => m.remove(posts))
                expect(await repository.count()).to.equal(0)
            }),
        ))

    it("should reject when a save reads a document after a previous write", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                let error: unknown
                try {
                    await dataSource.transaction(async (m) => {
                        await m.save(post("1"))
                        await m.save(post("2"))
                    })
                } catch (e) {
                    error = e
                }
                expect(error).to.be.instanceOf(Error)
                expect(await dataSource.getRepository(TxPost).count()).to.equal(
                    0,
                )
                await dataSource.transaction((m) => m.save(post("3")))
                expect(await dataSource.getRepository(TxPost).count()).to.equal(
                    1,
                )
            }),
        ))

    it("should roll back when the callback throws", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                let error: unknown
                try {
                    await dataSource.transaction(async (m) => {
                        await m.save([post("1"), post("2")])
                        throw new Error("boom")
                    })
                } catch (e) {
                    error = e
                }
                expect((error as Error).message).to.equal("boom")
                expect(await dataSource.getRepository(TxPost).count()).to.equal(
                    0,
                )
            }),
        ))

    it("should reject a read after a write and not leave the transaction pending", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                let error: unknown
                try {
                    await dataSource.transaction(async (m) => {
                        await m.save(post("1"))
                        await m.findOneBy(TxPost, { id: "1" })
                    })
                } catch (e) {
                    error = e
                }
                expect(error).to.be.instanceOf(Error)
                await dataSource.transaction((m) => m.save(post("2")))
                expect(await dataSource.getRepository(TxPost).count()).to.equal(
                    1,
                )
            }),
        ))

    it("should reject one of two conflicting transactions and run each callback once", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                await dataSource.getRepository(TxPost).save(post("1"))
                let calls = 0
                let arrived = 0
                let release!: () => void
                const gate = new Promise<void>((resolve) => {
                    release = resolve
                })
                const run = () =>
                    dataSource.transaction(async (m) => {
                        calls++
                        const current = await m.findOneBy(TxPost, { id: "1" })
                        arrived++
                        if (arrived === 2) release()
                        await gate
                        await m.update(
                            TxPost,
                            { id: "1" },
                            { counter: current!.counter + 1 },
                        )
                    })
                const results = await Promise.allSettled([run(), run()])
                const fulfilled = results.filter(
                    (r) => r.status === "fulfilled",
                ).length
                expect(fulfilled).to.be.lessThan(2)
                const stored = await dataSource
                    .getRepository(TxPost)
                    .findOneBy({ id: "1" })
                expect(stored!.counter).to.equal(fulfilled)
                expect(calls).to.equal(2)
            }),
        ))

    it("should reject more than 500 writes in one transaction", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const posts = Array.from({ length: 501 }, (_, i) =>
                    post(`p${i}`),
                )
                let error: unknown
                try {
                    await dataSource.transaction((m) => m.insert(TxPost, posts))
                } catch (e) {
                    error = e
                }
                expect((error as Error).message).to.contain(
                    "at most 500 writes",
                )
                expect(await dataSource.getRepository(TxPost).count()).to.equal(
                    0,
                )
            }),
        ))
})
