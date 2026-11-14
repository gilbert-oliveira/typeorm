import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"

export class Counters {
    @Column()
    views: number
}

@Entity()
export class EmbeddedPost {
    @PrimaryColumn()
    id: string

    @Column(() => Counters)
    counters: Counters
}
