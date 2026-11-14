# Firestore

## Firestore support

TypeORM has basic support for [Cloud Firestore](https://firebase.google.com/docs/firestore) through the Firebase Admin SDK (`firebase-admin` **v13 or later**), running in Native mode.

Firestore is a document database, so most of the TypeORM functionality that is specific to relational databases is not available. This page contains all Firestore-specific functionality.

:::note
Only the server-side `firebase-admin` SDK is supported. Support for `@react-native-firebase` is planned for a follow-up.
:::

## Installation

```shell
npm install firebase-admin
```

`firebase-admin` is an optional peer dependency of TypeORM. Install it only when you use the `firestore` driver.

## Data Source Options

- `firestore` - A ready-to-use Firestore instance. When set, the driver uses it as is and does not create or delete any Firebase app. The other connection options are ignored.

- `projectId` - Google Cloud project id.

- `credential` - A `firebase-admin` credential (for example `cert(serviceAccount)` or `applicationDefault()`) used to initialize the app. When omitted, the SDK resolves credentials on its own (application default credentials, or the emulator when `FIRESTORE_EMULATOR_HOST` is set).

- `databaseId` - Firestore database id. Default: `"(default)"`.

- `driver` - The driver object. Defaults to `require("firebase-admin")`.

Firestore has no `database`, `host`, `port`, `username` or `password` options.

Bootstrap with a service account:

```typescript
import { DataSource } from "typeorm"
import { cert } from "firebase-admin/app"

const myDataSource = new DataSource({
    type: "firestore",
    projectId: "my-project",
    credential: cert("./service-account.json"),
    entities: [User],
})

await myDataSource.initialize()
```

Bootstrap with an existing Firestore instance:

```typescript
import { DataSource } from "typeorm"
import { getFirestore } from "firebase-admin/firestore"

const myDataSource = new DataSource({
    type: "firestore",
    firestore: getFirestore(),
    entities: [User],
})
```

To use the [local emulator](https://firebase.google.com/docs/emulator-suite), export `FIRESTORE_EMULATOR_HOST` before starting your app:

```shell
export FIRESTORE_EMULATOR_HOST=localhost:8080
```

## Defining entities and columns

An entity is mapped to a collection, named after the entity table name. Each saved entity is a document in that collection.

An entity must have exactly one primary column, and it must be of type `string`. Its value is the document id and is **not** stored in the document data. Use either:

- `@PrimaryColumn()` - you provide the id.
- `@PrimaryGeneratedColumn("uuid")` - TypeORM generates the id.

```typescript
import { Entity, PrimaryColumn, Column } from "typeorm"

@Entity()
export class User {
    @PrimaryColumn()
    id: string

    @Column()
    firstName: string

    @Column({ nullable: true })
    lastName: string | null

    @Column()
    createdAt: Date
}
```

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"

@Entity()
export class Post {
    @PrimaryGeneratedColumn("uuid")
    id: string

    @Column()
    title: string
}
```

Rules:

- Ids must be valid Firestore document ids. Empty strings, `"."`, `".."` and values containing `/` are rejected with a `TypeORMError`.
- Nullable columns that are absent when an entity is inserted are stored as `null`.
- `Date` values are stored as Firestore `Timestamp` and read back as `Date`.
- `@CreateDateColumn()` and `@UpdateDateColumn()` are filled by TypeORM on the client, not by the database.

## Working with entities

Use the `firestoreManager` of the data source, or a repository:

```typescript
const user = await myDataSource.firestoreManager.findOneBy(User, {
    id: "user-1",
})

const repository = myDataSource.getFirestoreRepository(User)
const users = await repository.find({
    where: { firstName: In(["Timber", "Ana"]) },
    order: { firstName: "ASC" },
    take: 10,
})
```

### Supported methods

- `find`, `findBy`
- `findOne`, `findOneBy`
- `findOneOrFail`, `findOneByOrFail`
- `findAndCount`, `findAndCountBy`
- `count`, `countBy`
- `exists`, `existsBy`
- `save`, `insert`
- `update`, `delete`
- `remove`
- `transaction`

### Supported find options

- `where` with an object of columns. All conditions are combined with AND.
- `order`, `take`, `skip`
- `select`

A `where` on the primary column is translated to a lookup by document id.

### Supported operators

- Equality (`{ firstName: "Timber" }`)
- `In` (at most 30 values)
- `Not`, including `Not(In([...]))` (translated to `not-in`) and `Not(IsNull())`
- `MoreThan`, `MoreThanOrEqual`, `LessThan`, `LessThanOrEqual`
- `IsNull`

```typescript
import { In, Not, IsNull, MoreThan } from "typeorm"

await myDataSource.firestoreManager.find(User, {
    where: {
        id: Not(In(["user-1", "user-2"])),
        lastName: Not(IsNull()),
        createdAt: MoreThan(new Date("2024-01-01")),
    },
})
```

## Saving, updating and removing

- `save()` of a new entity creates the document. `save()` of an existing entity writes only the changed columns, using a Firestore `update`. If the document is deleted concurrently, the write fails with the SDK `NOT_FOUND` error.
- `update()` and `delete()` only count documents that exist.
- `save()` and `remove()` run in a transaction by default.
- Writes outside of a transaction are sent in batches of up to 500 operations.

## Transactions

```typescript
await myDataSource.firestoreManager.transaction(async (manager) => {
    const user = await manager.findOneByOrFail(User, { id: "user-1" })
    user.firstName = "Timber"
    await manager.save(user)
})
```

Firestore transactions have restrictions that TypeORM does not hide:

- **Single attempt.** TypeORM runs transactions with `maxAttempts: 1` and never retries. When there is contention, the SDK error reaches your code, and retrying is up to you.
- **No reads after writes.** Firestore requires all reads of a transaction to happen before its first write. A read after a write throws the SDK error.
- **At most 500 writes.** Exceeding it throws `TypeORMError("Firestore transactions support at most 500 writes.")`.

Because `save()` reads the document before writing it, calling `save()` more than once inside a transaction fails when the second entity has an explicit id: the second call reads after the first call wrote.

```typescript
await myDataSource.firestoreManager.transaction(async (manager) => {
    await manager.save(User, { id: "a", firstName: "Timber" })
    await manager.save(User, { id: "b", firstName: "Ana" })
})
```

Save all entities in a single call instead:

```typescript
await myDataSource.firestoreManager.transaction(async (manager) => {
    await manager.save(User, [
        { id: "a", firstName: "Timber" },
        { id: "b", firstName: "Ana" },
    ])
})
```

## Schema

- `synchronize` is a no-op. Collections are created implicitly by Firestore when the first document is written.
- `dropSchema` deletes all documents of the collections of the registered entities.

## `null` and `Not` with missing fields

Firestore does not return documents where the filtered field does not exist for `!=` and `not-in` queries, and `IsNull()` only matches fields that are explicitly stored as `null`.

TypeORM always stores nullable columns as `null` on insert, so documents it writes behave as expected. Documents written by other tools without the field are excluded from `Not(...)` and `Not(In(...))` results and do not match `IsNull()`.

## Costs and indexes

- `skip` is translated to a Firestore `offset`. Skipped documents are still read and billed. Prefer filtering on indexed fields over large offsets.
- Queries combining filters and ordering on different fields require composite indexes in production. The emulator does not require them, so a query that works locally can fail with `FAILED_PRECONDITION` in production until the index is created.

## Not supported

The following throw a `TypeORMError` with the message `<feature> is not supported by Firestore.`:

- `QueryBuilder` and raw `query()`
- Relations, including the `relations`, `relationLoadStrategy`, `loadRelationIds` and `join` find options
- Embedded columns
- Soft delete: `@DeleteDateColumn`, `softDelete`, `softRemove`, `restore`, `recover` and the `withDeleted` option
- `@VersionColumn`
- Table inheritance and tree entities
- Migrations
- `upsert`, `increment`, `decrement`
- `clear`, `preload`, `findByIds`
- `sum`, `average`, `minimum`, `maximum`
- `deleteAll`, `updateAll`
- `lock` and `cache` find options
- `where` as an array (OR) and nested `where` objects
- The `Between`, `Like`, `ILike`, `Raw` and `Any` operators and array operators
