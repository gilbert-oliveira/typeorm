import { Column } from "../../../../../src/decorator/columns/Column"
import { Entity } from "../../../../../src/decorator/entity/Entity"

@Entity()
export class NoPrimaryPost {
    @Column()
    title: string
}
