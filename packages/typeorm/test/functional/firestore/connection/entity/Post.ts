import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"

@Entity()
export class Post {
    @PrimaryColumn()
    id: string

    @Column()
    title: string

    @Column({ nullable: true })
    text?: string
}
