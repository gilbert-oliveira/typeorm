import "reflect-metadata"
import { expect } from "chai"
import type { DataSource } from "../../../../src/data-source/DataSource"
import { FirestoreDriver } from "../../../../src/driver/firestore/FirestoreDriver"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { Post } from "./entity/Post"

describe("firestore > connection", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [Post],
            enabledDrivers: ["firestore"],
            schemaCreate: true,
            dropSchema: true,
        })
    })
    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    it("should connect using the firestore driver", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                expect(dataSource.isInitialized).to.be.true
                expect(dataSource.driver).to.be.instanceOf(FirestoreDriver)
            }),
        ))

    it("should synchronize and drop the database", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                await dataSource.synchronize()
                await dataSource.dropDatabase()
            }),
        ))

    it("should be disconnected after destroy", async function () {
        const [dataSource] = await createTestingConnections({
            entities: [Post],
            enabledDrivers: ["firestore"],
        })
        if (!dataSource) return this.skip()
        await dataSource.destroy()
        expect(dataSource.isInitialized).to.be.false
    })

    it("adapter should write, read, query and count documents", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const adapter = (dataSource.driver as FirestoreDriver).adapter
                const generatedId = adapter.newDocumentId("post")
                expect(generatedId).to.be.a("string").and.not.empty

                await adapter.write([
                    {
                        type: "create",
                        collection: "post",
                        id: "1",
                        data: { title: "one", text: "a" },
                    },
                    {
                        type: "create",
                        collection: "post",
                        id: "2",
                        data: { title: "two" },
                    },
                    {
                        type: "create",
                        collection: "post",
                        id: "3",
                        data: { title: "three" },
                    },
                ])
                await adapter.write([
                    {
                        type: "merge",
                        collection: "post",
                        id: "1",
                        data: { text: "b" },
                    },
                    {
                        type: "update",
                        collection: "post",
                        id: "2",
                        data: { title: "TWO" },
                    },
                    { type: "delete", collection: "post", id: "3" },
                ])

                const documents = await adapter.getDocuments("post", [
                    "2",
                    "missing",
                    "1",
                    "3",
                ])
                expect(documents).to.deep.equal([
                    { id: "2", data: { title: "TWO" } },
                    { id: "1", data: { title: "one", text: "b" } },
                ])

                const found = await adapter.runQuery({
                    collection: "post",
                    filters: [{ field: "title", op: "==", value: "TWO" }],
                    orderBy: [],
                })
                expect(found).to.deep.equal([
                    { id: "2", data: { title: "TWO" } },
                ])

                const total = await adapter.count({
                    collection: "post",
                    filters: [],
                    orderBy: [],
                    limit: 1,
                })
                expect(total).to.equal(2)
            }),
        ))
})
