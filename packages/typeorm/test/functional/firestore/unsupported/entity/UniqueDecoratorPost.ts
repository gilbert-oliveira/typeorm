import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { Unique } from "../../../../../src/decorator/Unique"

@Unique(["title"])
@Entity()
export class UniqueDecoratorPost {
    @PrimaryColumn()
    id: string

    @Column()
    title: string
}
