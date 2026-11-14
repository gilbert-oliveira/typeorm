import "reflect-metadata"
import { expect } from "chai"
import { DataSource } from "../../../../src/data-source/DataSource"
import {
    closeTestingConnections,
    createTestingConnections,
    setupTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { CompositePost } from "./entity/CompositePost"
import { EmbeddedPost } from "./entity/EmbeddedPost"
import { GeneratedPost } from "./entity/GeneratedPost"
import { InheritanceChildPost, InheritancePost } from "./entity/InheritancePost"
import { NoPrimaryPost } from "./entity/NoPrimaryPost"
import { NumberPost } from "./entity/NumberPost"
import { Post } from "./entity/Post"
import { RelationPost } from "./entity/RelationPost"
import { SoftDeletePost } from "./entity/SoftDeletePost"
import { TreePost } from "./entity/TreePost"
import { VersionPost } from "./entity/VersionPost"

describe("firestore > unsupported", () => {
    describe("metadata validation", () => {
        const cases: [string, Function[], string][] = [
            ["relations", [RelationPost], "Relations is not supported"],
            ["embedded columns", [EmbeddedPost], "Embedded columns is not"],
            ["soft delete", [SoftDeletePost], "Soft delete is not supported"],
            ["version columns", [VersionPost], "Version columns is not"],
            [
                "missing primary column",
                [NoPrimaryPost],
                "Firestore entities must have exactly one primary column.",
            ],
            [
                "composite primary columns",
                [CompositePost],
                "Firestore entities must have exactly one primary column.",
            ],
            [
                "generated numeric primary key",
                [GeneratedPost],
                "Generated numeric primary keys is not supported by Firestore.",
            ],
            [
                "non-string primary column",
                [NumberPost],
                "Firestore primary column must be a string.",
            ],
            [
                "table inheritance",
                [InheritancePost, InheritanceChildPost],
                "Table inheritance is not supported by Firestore.",
            ],
            [
                "tree entities",
                [TreePost],
                "Tree entities is not supported by Firestore.",
            ],
        ]

        cases.forEach(([name, entities, message]) => {
            it(`should reject ${name}`, async function () {
                const optionsList = setupTestingConnections({
                    entities,
                    enabledDrivers: ["firestore"],
                })
                if (!optionsList.length) return this.skip()

                for (const options of optionsList) {
                    const dataSource = new DataSource(options)
                    let error: Error | undefined
                    try {
                        await dataSource.initialize()
                    } catch (e) {
                        error = e as Error
                    }
                    if (dataSource.isInitialized) await dataSource.destroy()
                    expect(error, "expected connection to fail").to.not.be
                        .undefined
                    expect(error!.message).to.contain(message)
                }
            })
        })
    })

    describe("manager methods", () => {
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

        const calls: [string, (manager: any) => any][] = [
            ["upsert", (m) => m.upsert(Post, { id: "1", title: "a" }, ["id"])],
            ["increment", (m) => m.increment(Post, { id: "1" }, "title", 1)],
            ["decrement", (m) => m.decrement(Post, { id: "1" }, "title", 1)],
            ["softDelete", (m) => m.softDelete(Post, "1")],
            ["restore", (m) => m.restore(Post, "1")],
            ["softRemove", (m) => m.softRemove(Post, new Post())],
            ["recover", (m) => m.recover(Post, new Post())],
            ["clear", (m) => m.clear(Post)],
            ["preload", (m) => m.preload(Post, { id: "1" })],
            ["sum", (m) => m.sum(Post, "title")],
            ["average", (m) => m.average(Post, "title")],
            ["minimum", (m) => m.minimum(Post, "title")],
            ["maximum", (m) => m.maximum(Post, "title")],
            ["findByIds", (m) => m.findByIds(Post, ["1"])],
            ["getTreeRepository", (m) => m.getTreeRepository(Post)],
            ["createQueryBuilder", (m) => m.createQueryBuilder(Post, "post")],
            ["query", (m) => m.query("SELECT 1")],
            ["deleteAll", (m) => m.deleteAll(Post)],
            ["updateAll", (m) => m.updateAll(Post, { title: "x" })],
        ]

        calls.forEach(([name, call]) => {
            it(`should reject ${name}`, () =>
                Promise.all(
                    dataSources.map(async (dataSource) => {
                        let error: Error | undefined
                        try {
                            await call(dataSource.manager)
                        } catch (e) {
                            error = e as Error
                        }
                        expect(error, "expected call to fail").to.not.be
                            .undefined
                        expect(error!.message).to.contain(
                            "is not supported by Firestore.",
                        )
                    }),
                ))
        })
    })
})
