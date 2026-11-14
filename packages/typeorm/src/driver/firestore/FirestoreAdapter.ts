import type { FirestoreQuery } from "./FirestoreQuery"

export type FirestoreTransactionHandle = {
    readonly __firestoreTransaction: unique symbol
}

export interface FirestoreDocument {
    id: string
    data: Record<string, unknown>
}

export type FirestoreWriteOperation =
    | {
          type: "create" | "merge" | "update"
          collection: string
          id: string
          data: Record<string, unknown>
      }
    | { type: "delete"; collection: string; id: string }

export interface FirestoreAdapter {
    getDocuments(
        collection: string,
        ids: string[],
        tx?: FirestoreTransactionHandle,
    ): Promise<FirestoreDocument[]>

    runQuery(
        query: FirestoreQuery,
        tx?: FirestoreTransactionHandle,
    ): Promise<FirestoreDocument[]>

    count(
        query: FirestoreQuery,
        tx?: FirestoreTransactionHandle,
    ): Promise<number>

    write(
        operations: FirestoreWriteOperation[],
        tx?: FirestoreTransactionHandle,
    ): Promise<void>

    runTransaction<T>(
        fn: (tx: FirestoreTransactionHandle) => Promise<T>,
    ): Promise<T>

    deleteCollections(collections: string[]): Promise<void>

    close(): Promise<void>
}
