import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { Check } from "../../../../../src/decorator/Check"

@Check(`"title" <> ''`)
@Entity()
export class CheckPost {
    @PrimaryColumn()
    id: string

    @Column()
    title: string
}
