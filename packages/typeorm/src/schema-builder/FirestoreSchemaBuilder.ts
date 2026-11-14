import type { SchemaBuilder } from "./SchemaBuilder"
import { SqlInMemory } from "../driver/SqlInMemory"

/**
 * Firestore is schema-less, so there is nothing to build.
 */
export class FirestoreSchemaBuilder implements SchemaBuilder {
    async build(): Promise<void> {}

    log(): Promise<SqlInMemory> {
        return Promise.resolve(new SqlInMemory())
    }
}
