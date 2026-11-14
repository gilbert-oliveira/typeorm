import type { ObjectLiteral } from "../common/ObjectLiteral"
import type { FirestoreEntityManager } from "../entity-manager/FirestoreEntityManager"
import { Repository } from "./Repository"

export class FirestoreRepository<
    Entity extends ObjectLiteral,
> extends Repository<Entity> {
    declare readonly manager: FirestoreEntityManager
}
