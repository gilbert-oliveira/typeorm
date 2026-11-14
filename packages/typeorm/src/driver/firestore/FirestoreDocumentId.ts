import { TypeORMError } from "../../error/TypeORMError"

/**
 *
 * @param id
 */
export function assertValidDocumentId(id: unknown): asserts id is string {
    if (
        typeof id !== "string" ||
        id.length === 0 ||
        id.includes("/") ||
        id === "." ||
        id === ".." ||
        Buffer.byteLength(id, "utf8") > 1500 ||
        /^__.*__$/.test(id)
    ) {
        throw new TypeORMError(`Invalid Firestore document id: ${String(id)}`)
    }
}
