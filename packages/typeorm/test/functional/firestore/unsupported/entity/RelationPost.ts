import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { ManyToOne } from "../../../../../src/decorator/relations/ManyToOne"

@Entity()
export class RelationPost {
    @PrimaryColumn()
    id: string

    @ManyToOne(() => RelationPost)
    parent: RelationPost
}
