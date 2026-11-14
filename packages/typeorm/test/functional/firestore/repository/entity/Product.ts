import { Column } from "../../../../../src/decorator/columns/Column"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"

@Entity("product")
export class Product {
    @PrimaryColumn()
    id: string

    @Column()
    name: string

    @Column({ type: "int", nullable: true })
    score: number | null

    @Column({ type: "timestamp", nullable: true })
    releasedAt: Date | null
}
