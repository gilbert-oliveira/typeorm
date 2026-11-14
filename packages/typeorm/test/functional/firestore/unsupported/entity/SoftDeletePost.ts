import { DeleteDateColumn } from "../../../../../src/decorator/columns/DeleteDateColumn"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"

@Entity()
export class SoftDeletePost {
    @PrimaryColumn()
    id: string

    @DeleteDateColumn()
    deletedAt?: Date
}
