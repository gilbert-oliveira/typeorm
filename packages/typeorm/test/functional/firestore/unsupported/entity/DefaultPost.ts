import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"

@Entity()
export class DefaultPost {
    @PrimaryColumn()
    id: string

    @Column({ default: "untitled" })
    title: string
}
