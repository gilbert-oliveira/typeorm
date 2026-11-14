export const FIRESTORE_DOCUMENT_ID = "__name__"

export type FirestoreFilterOp =
    "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in"

export interface FirestoreFilter {
    field: string
    op: FirestoreFilterOp
    value: unknown
}

export interface FirestoreQuery {
    collection: string
    filters: FirestoreFilter[]
    orderBy: { field: string; direction: "asc" | "desc" }[]
    limit?: number
    offset?: number
    select?: string[]
}
