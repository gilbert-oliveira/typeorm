import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { ChildEntity } from "../../../../../src/decorator/entity/ChildEntity"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { TableInheritance } from "../../../../../src/decorator/entity/TableInheritance"

@Entity()
@TableInheritance({ column: { type: "string", name: "kind" } })
export class InheritancePost {
    @PrimaryColumn()
    id: string
}

@ChildEntity()
export class InheritanceChildPost extends InheritancePost {}
