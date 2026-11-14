import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { Exclusion } from "../../../../../src/decorator/Exclusion"

@Exclusion(`USING gist ("title" WITH =)`)
@Entity()
export class ExclusionPost {
    @PrimaryColumn()
    id: string

    @Column()
    title: string
}
