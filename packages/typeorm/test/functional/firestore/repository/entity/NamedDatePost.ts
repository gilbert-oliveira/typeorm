import { Column } from "../../../../../src/decorator/columns/Column"
import { CreateDateColumn } from "../../../../../src/decorator/columns/CreateDateColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { UpdateDateColumn } from "../../../../../src/decorator/columns/UpdateDateColumn"

@Entity("named_date_post")
export class NamedDatePost {
    @PrimaryColumn()
    id: string

    @Column()
    title: string

    @CreateDateColumn({ name: "created_at" })
    createdAt: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt: Date

    constructor(init?: Partial<NamedDatePost>) {
        Object.assign(this, init)
    }
}
