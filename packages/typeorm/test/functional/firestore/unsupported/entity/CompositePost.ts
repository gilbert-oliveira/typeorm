import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"

@Entity()
export class CompositePost {
    @PrimaryColumn()
    id: string

    @PrimaryColumn()
    tenant: string
}
