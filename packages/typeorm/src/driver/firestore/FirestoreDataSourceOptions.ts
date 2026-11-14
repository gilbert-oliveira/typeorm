import type { BaseDataSourceOptions } from "../../data-source/BaseDataSourceOptions"

/**
 * Firestore specific connection options.
 */
export interface FirestoreDataSourceOptions extends BaseDataSourceOptions {
    /**
     * Database type.
     */
    readonly type: "firestore"

    /**
     * Not used by Firestore, use {@link databaseId} instead.
     */
    readonly database?: undefined

    /**
     * Ready-to-use Firestore instance. When set, the driver uses it as is
     * and does not create or delete any firebase app.
     */
    readonly firestore?: unknown

    /**
     * Google Cloud project id.
     */
    readonly projectId?: string

    /**
     * firebase-admin Credential used to initialize the app.
     */
    readonly credential?: unknown

    /**
     * Firestore database id. Defaults to "(default)".
     */
    readonly databaseId?: string

    /**
     * The driver to use. Defaults to the firebase-admin package.
     */
    readonly driver?: any
}
