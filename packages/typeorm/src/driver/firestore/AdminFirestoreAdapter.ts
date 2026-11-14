import { TypeORMError } from "../../error"
import type {
    FirestoreAdapter,
    FirestoreDocument,
    FirestoreTransactionHandle,
    FirestoreWriteOperation,
} from "./FirestoreAdapter"
import type { FirestoreQuery } from "./FirestoreQuery"
import { FIRESTORE_DOCUMENT_ID } from "./FirestoreQuery"

const MAX_BATCH_SIZE = 500

export class AdminFirestoreAdapter implements FirestoreAdapter {
    constructor(
        protected firestore: any,
        protected fieldPath: any,
        protected onClose: () => Promise<void>,
    ) {}

    newDocumentId(collection: string): string {
        return this.firestore.collection(collection).doc().id
    }

    async getDocuments(
        collection: string,
        ids: string[],
        tx?: FirestoreTransactionHandle,
    ): Promise<FirestoreDocument[]> {
        if (ids.length === 0) return []
        const references = ids.map((id) =>
            this.firestore.collection(collection).doc(id),
        )
        const snapshots: any[] = tx
            ? await this.asTransaction(tx).getAll(...references)
            : await this.firestore.getAll(...references)
        return snapshots
            .filter((snapshot) => snapshot.exists)
            .map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }))
    }

    async runQuery(
        query: FirestoreQuery,
        tx?: FirestoreTransactionHandle,
    ): Promise<FirestoreDocument[]> {
        const built = this.buildQuery(query, true)
        const snapshot = tx
            ? await this.asTransaction(tx).get(built)
            : await built.get()
        return snapshot.docs.map((doc: any) => ({
            id: doc.id,
            data: doc.data(),
        }))
    }

    async count(
        query: FirestoreQuery,
        tx?: FirestoreTransactionHandle,
    ): Promise<number> {
        const built = this.buildQuery(query, false).count()
        const snapshot = tx
            ? await this.asTransaction(tx).get(built)
            : await built.get()
        return snapshot.data().count
    }

    async write(
        operations: FirestoreWriteOperation[],
        tx?: FirestoreTransactionHandle,
    ): Promise<void> {
        if (tx) {
            const transaction = this.asTransaction(tx)
            for (const operation of operations) {
                this.applyOperation(transaction, operation)
            }
            return
        }

        for (let i = 0; i < operations.length; i += MAX_BATCH_SIZE) {
            const batch = this.firestore.batch()
            for (const operation of operations.slice(i, i + MAX_BATCH_SIZE)) {
                this.applyOperation(batch, operation)
            }
            await batch.commit()
        }
    }

    runTransaction<T>(
        fn: (tx: FirestoreTransactionHandle) => Promise<T>,
    ): Promise<T> {
        return this.firestore.runTransaction(
            (transaction: any) => fn(transaction as FirestoreTransactionHandle),
            { maxAttempts: 1 },
        )
    }

    async deleteCollections(collections: string[]): Promise<void> {
        for (const name of collections) {
            await this.firestore.recursiveDelete(
                this.firestore.collection(name),
            )
        }
    }

    async close(): Promise<void> {
        await this.onClose()
    }

    protected asTransaction(tx: FirestoreTransactionHandle): any {
        return tx
    }

    protected fieldReference(field: string): unknown {
        return field === FIRESTORE_DOCUMENT_ID
            ? this.fieldPath.documentId()
            : field
    }

    protected buildQuery(query: FirestoreQuery, paginate: boolean): any {
        let built: any = this.firestore.collection(query.collection)
        for (const filter of query.filters) {
            built = built.where(
                this.fieldReference(filter.field),
                filter.op,
                filter.value,
            )
        }
        if (!paginate) return built
        for (const order of query.orderBy) {
            built = built.orderBy(
                this.fieldReference(order.field),
                order.direction,
            )
        }
        if (query.offset !== undefined) built = built.offset(query.offset)
        if (query.limit !== undefined) built = built.limit(query.limit)
        if (query.select) {
            built = built.select(
                ...query.select.map((field) => this.fieldReference(field)),
            )
        }
        return built
    }

    protected applyOperation(
        target: any,
        operation: FirestoreWriteOperation,
    ): void {
        const reference = this.firestore
            .collection(operation.collection)
            .doc(operation.id)
        switch (operation.type) {
            case "create":
                target.create(reference, operation.data)
                break
            case "merge":
                target.set(reference, operation.data, { merge: true })
                break
            case "update":
                target.update(reference, operation.data)
                break
            case "delete":
                target.delete(reference)
                break
            default:
                throw new TypeORMError(`Unknown Firestore write operation.`)
        }
    }
}
