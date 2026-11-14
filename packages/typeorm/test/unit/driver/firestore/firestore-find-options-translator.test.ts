import { expect } from "chai"
import {
    Between,
    DataSource,
    EntitySchema,
    In,
    IsNull,
    LessThan,
    LessThanOrEqual,
    Like,
    MoreThan,
    MoreThanOrEqual,
    Not,
    TypeORMError,
} from "../../../../src"
import type { EntityMetadata } from "../../../../src/metadata/EntityMetadata"
import type { FirestoreDriver } from "../../../../src/driver/firestore/FirestoreDriver"
import { FirestoreFindOptionsTranslator } from "../../../../src/driver/firestore/FirestoreFindOptionsTranslator"

const PostSchema = new EntitySchema<any>({
    name: "Post",
    tableName: "posts",
    columns: {
        id: { type: String, primary: true },
        title: { type: String },
        views: { type: Number, name: "view_count" },
    },
})

describe("FirestoreFindOptionsTranslator", () => {
    let translator: FirestoreFindOptionsTranslator
    let metadata: EntityMetadata

    before(async () => {
        const dataSource = new DataSource({
            type: "firestore",
            projectId: "translator-test",
            entities: [PostSchema],
        })
        await (dataSource as any).buildMetadatas()
        metadata = dataSource.getMetadata("Post")
        translator = new FirestoreFindOptionsTranslator(
            dataSource.driver as FirestoreDriver,
        )
    })

    const expectUnsupported = (options: any, feature: string) => {
        expect(() => translator.translate(metadata, options))
            .to.throw(TypeORMError)
            .with.property(
                "message",
                `${feature} is not supported by Firestore.`,
            )
    }

    it("should use the table name as collection", () => {
        expect(translator.translate(metadata).collection).to.equal("posts")
    })

    it("should translate equality", () => {
        expect(
            translator.translate(metadata, { where: { title: "a" } }).filters,
        ).to.deep.equal([{ field: "title", op: "==", value: "a" }])
    })

    it("should use the database name of the column", () => {
        expect(
            translator.translate(metadata, { where: { views: 3 } }).filters,
        ).to.deep.equal([{ field: "view_count", op: "==", value: 3 }])
    })

    it("should map the primary column to the document id", () => {
        expect(
            translator.translate(metadata, { where: { id: In(["1", "2"]) } })
                .filters,
        ).to.deep.equal([{ field: "__name__", op: "in", value: ["1", "2"] }])
        expect(
            translator.translate(metadata, { where: { id: "x" } }).filters,
        ).to.deep.equal([{ field: "__name__", op: "==", value: "x" }])
    })

    it("should translate not-in, not and is null", () => {
        expect(
            translator.translate(metadata, {
                where: { title: Not(In(["a", "b"])) },
            }).filters,
        ).to.deep.equal([{ field: "title", op: "not-in", value: ["a", "b"] }])
        expect(
            translator.translate(metadata, { where: { title: Not("a") } })
                .filters,
        ).to.deep.equal([{ field: "title", op: "!=", value: "a" }])
        expect(
            translator.translate(metadata, { where: { title: IsNull() } })
                .filters,
        ).to.deep.equal([{ field: "title", op: "==", value: null }])
    })

    it("should translate comparison operators", () => {
        const op = (value: any) =>
            translator.translate(metadata, { where: { views: value } })
                .filters[0].op
        expect(op(MoreThan(1))).to.equal(">")
        expect(op(MoreThanOrEqual(1))).to.equal(">=")
        expect(op(LessThan(1))).to.equal("<")
        expect(op(LessThanOrEqual(1))).to.equal("<=")
    })

    it("should combine multiple where properties", () => {
        expect(
            translator.translate(metadata, {
                where: { title: "a", views: MoreThan(1) },
            }).filters,
        ).to.deep.equal([
            { field: "title", op: "==", value: "a" },
            { field: "view_count", op: ">", value: 1 },
        ])
    })

    it("should translate order, take and skip", () => {
        const query = translator.translate(metadata, {
            order: { title: "DESC" },
            take: 5,
            skip: 10,
        })
        expect(query.orderBy).to.deep.equal([
            { field: "title", direction: "desc" },
        ])
        expect(query.limit).to.equal(5)
        expect(query.offset).to.equal(10)
    })

    it("should translate select without the primary column", () => {
        expect(
            translator.translate(metadata, {
                select: { id: true, title: true },
            }).select,
        ).to.deep.equal(["title"])
    })

    it("should reject In with more than 30 values", () => {
        const values = Array.from({ length: 31 }, (_, i) => String(i))
        expectUnsupported(
            { where: { id: In(values) } },
            "In with more than 30 values",
        )
    })

    it("should accept In with 30 values", () => {
        const values = Array.from({ length: 30 }, (_, i) => String(i))
        expect(
            translator.translate(metadata, { where: { id: In(values) } })
                .filters[0].value,
        ).to.deep.equal(values)
    })

    it("should reject unsupported where shapes and operators", () => {
        expectUnsupported(
            { where: [{ title: "a" }, { title: "b" }] },
            "OR where",
        )
        expectUnsupported({ where: { title: Like("a%") } }, "like")
        expectUnsupported({ where: { views: Between(1, 2) } }, "between")
        expectUnsupported({ where: { title: { nested: "a" } } }, "Nested where")
    })

    it("should reject unsupported options", () => {
        expectUnsupported({ relations: { x: true } }, "relations")
        expectUnsupported({ lock: { mode: "pessimistic_read" } }, "lock")
        expectUnsupported({ cache: true }, "cache")
        expectUnsupported({ loadRelationIds: true }, "loadRelationIds")
        expectUnsupported({ withDeleted: true }, "withDeleted")
        expectUnsupported({ join: { alias: "p" } }, "join")
        expectUnsupported(
            { relationLoadStrategy: "query" },
            "relationLoadStrategy",
        )
    })
})
