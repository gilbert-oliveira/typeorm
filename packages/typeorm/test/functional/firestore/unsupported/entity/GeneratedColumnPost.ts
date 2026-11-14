import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { Generated } from "../../../../../src/decorator/Generated"

@Entity()
export class GeneratedColumnPost {
    @PrimaryColumn()
    id: string

    @Generated("uuid")
    @Column()
    token: string
}
