import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { Tree } from "../../../../../src/decorator/tree/Tree"

@Entity()
@Tree("nested-set")
export class TreePost {
    @PrimaryColumn()
    id: string
}
