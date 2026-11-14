import { TypeORMError } from "../../error"
import type { FindManyOptions } from "../../find-options/FindManyOptions"
import type { FindOperator } from "../../find-options/FindOperator"
import type { ColumnMetadata } from "../../metadata/ColumnMetadata"
import type { EntityMetadata } from "../../metadata/EntityMetadata"
import { InstanceChecker } from "../../util/InstanceChecker"
import type { FirestoreDriver } from "./FirestoreDriver"
import {
    FIRESTORE_DOCUMENT_ID,
    type FirestoreFilter,
    type FirestoreFilterOp,
    type FirestoreQuery,
} from "./FirestoreQuery"

const MAX_IN_VALUES = 30

const COMPARISON_OPERATORS: Record<string, FirestoreFilterOp> = {
    moreThan: ">",
    moreThanOrEqual: ">=",
    lessThan: "<",
    lessThanOrEqual: "<=",
}

export class FirestoreFindOptionsTranslator {
    constructor(private driver: FirestoreDriver) {}

    translate(
        metadata: EntityMetadata,
        options?: FindManyOptions<any>,
    ): FirestoreQuery {
        const query: FirestoreQuery = {
            collection: metadata.tableName,
            filters: [],
            orderBy: [],
        }

        if (!options) return query

        this.assertSupportedOptions(options)

        if (options.where !== undefined && options.where !== null) {
            query.filters = this.translateWhere(metadata, options.where)
        }

        if (options.order) {
            query.orderBy = this.translateOrder(metadata, options.order)
        }

        if (options.take !== undefined) query.limit = options.take
        if (options.skip !== undefined) query.offset = options.skip

        if (options.select) {
            query.select = this.translateSelect(metadata, options.select)
        }

        return query
    }

    private assertSupportedOptions(options: FindManyOptions<any>): void {
        const unsupported = options as any

        const hasRelations = Array.isArray(unsupported.relations)
            ? unsupported.relations.length > 0
            : !!unsupported.relations &&
              Object.keys(unsupported.relations).length > 0

        if (hasRelations) this.throwUnsupported("relations")
        if (unsupported.lock) this.throwUnsupported("lock")
        if (unsupported.cache) this.throwUnsupported("cache")
        if (unsupported.loadRelationIds) {
            this.throwUnsupported("loadRelationIds")
        }
        if (unsupported.withDeleted === true) {
            this.throwUnsupported("withDeleted")
        }
        if (unsupported.join) this.throwUnsupported("join")
        if (unsupported.relationLoadStrategy) {
            this.throwUnsupported("relationLoadStrategy")
        }
    }

    private translateWhere(
        metadata: EntityMetadata,
        where: unknown,
    ): FirestoreFilter[] {
        if (Array.isArray(where)) this.throwUnsupported("OR where")

        const filters: FirestoreFilter[] = []

        for (const [propertyName, value] of Object.entries(
            where as Record<string, unknown>,
        )) {
            if (value === undefined) continue

            const column = this.findColumn(metadata, propertyName)
            const field = this.fieldOf(column)

            if (InstanceChecker.isFindOperator(value)) {
                filters.push(this.translateOperator(column, field, value))
            } else if (this.isNestedObject(value)) {
                this.throwUnsupported("Nested where")
            } else {
                filters.push({
                    field,
                    op: "==",
                    value: this.prepare(column, value),
                })
            }
        }

        return filters
    }

    private translateOperator(
        column: ColumnMetadata,
        field: string,
        operator: FindOperator<any>,
    ): FirestoreFilter {
        switch (operator.type) {
            case "equal":
                return {
                    field,
                    op: "==",
                    value: this.prepare(column, operator.value),
                }
            case "in":
                return {
                    field,
                    op: "in",
                    value: this.prepareInValues(column, operator.value),
                }
            case "isNull":
                return { field, op: "==", value: null }
            case "not":
                return this.translateNot(column, field, operator)
            case "moreThan":
            case "moreThanOrEqual":
            case "lessThan":
            case "lessThanOrEqual":
                return {
                    field,
                    op: COMPARISON_OPERATORS[operator.type],
                    value: this.prepare(column, operator.value),
                }
            default:
                return this.throwUnsupported(operator.type)
        }
    }

    private translateNot(
        column: ColumnMetadata,
        field: string,
        operator: FindOperator<any>,
    ): FirestoreFilter {
        const child = operator.child

        if (!child) {
            return {
                field,
                op: "!=",
                value: this.prepare(column, operator.value),
            }
        }

        switch (child.type) {
            case "in":
                return {
                    field,
                    op: "not-in",
                    value: this.prepareInValues(column, child.value),
                }
            case "equal":
                return {
                    field,
                    op: "!=",
                    value: this.prepare(column, child.value),
                }
            case "isNull":
                return { field, op: "!=", value: null }
            default:
                return this.throwUnsupported(`Not with ${child.type}`)
        }
    }

    private prepareInValues(
        column: ColumnMetadata,
        values: unknown,
    ): unknown[] {
        if (!Array.isArray(values)) {
            throw new TypeORMError("In requires an array of values.")
        }
        if (values.length > MAX_IN_VALUES) {
            this.throwUnsupported(`In with more than ${MAX_IN_VALUES} values`)
        }
        return values.map((value) => this.prepare(column, value))
    }

    private translateOrder(
        metadata: EntityMetadata,
        order: Record<string, unknown>,
    ): FirestoreQuery["orderBy"] {
        return Object.entries(order)
            .filter(([, direction]) => direction !== undefined)
            .map(([propertyName, direction]) => {
                const column = this.findColumn(metadata, propertyName)
                const raw =
                    direction && typeof direction === "object"
                        ? (direction as { direction?: unknown }).direction
                        : direction
                const descending =
                    raw === "DESC" ||
                    raw === "desc" ||
                    raw === -1 ||
                    raw === "descending"
                return {
                    field: this.fieldOf(column),
                    direction: descending ? "desc" : "asc",
                } as const
            })
    }

    private translateSelect(
        metadata: EntityMetadata,
        select: unknown,
    ): string[] {
        const propertyNames = Array.isArray(select)
            ? (select as string[])
            : Object.entries(select as Record<string, unknown>)
                  .filter(([, selected]) => selected)
                  .map(([propertyName, selected]) => {
                      if (typeof selected === "object") {
                          this.throwUnsupported("Nested select")
                      }
                      return propertyName
                  })

        return propertyNames
            .map((propertyName) => this.findColumn(metadata, propertyName))
            .filter((column) => !column.isPrimary)
            .map((column) => column.databaseName)
    }

    private findColumn(
        metadata: EntityMetadata,
        propertyName: string,
    ): ColumnMetadata {
        const column = metadata.findColumnWithPropertyName(propertyName)
        if (!column) {
            throw new TypeORMError(
                `Property "${propertyName}" was not found in "${metadata.name}" as a column.`,
            )
        }
        return column
    }

    private fieldOf(column: ColumnMetadata): string {
        return column.isPrimary ? FIRESTORE_DOCUMENT_ID : column.databaseName
    }

    private prepare(column: ColumnMetadata, value: unknown): unknown {
        return this.driver.preparePersistentValue(value, column)
    }

    private isNestedObject(value: unknown): boolean {
        if (value === null || typeof value !== "object") return false
        if (Array.isArray(value) || value instanceof Date) return false
        const proto = Object.getPrototypeOf(value)
        return proto === Object.prototype || proto === null
    }

    private throwUnsupported(feature: string): never {
        throw new TypeORMError(`${feature} is not supported by Firestore.`)
    }
}
