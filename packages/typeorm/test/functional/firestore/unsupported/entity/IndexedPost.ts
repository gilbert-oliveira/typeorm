import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { Index } from "../../../../../src/decorator/Index"

@Entity()
export class IndexedPost {
    @PrimaryColumn()
    id: string

    @Index()
    @Column()
    title: string
}
