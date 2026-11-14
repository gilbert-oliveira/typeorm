import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"

@Entity()
export class TxPost {
    @PrimaryColumn()
    id: string

    @Column()
    title: string

    @Column({ default: 0 })
    counter: number
}
